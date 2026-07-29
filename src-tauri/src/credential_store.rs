use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::{Map, Value};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static VAULT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn vault_lock() -> &'static Mutex<()> {
    VAULT_LOCK.get_or_init(|| Mutex::new(()))
}

fn vault_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Unable to locate application data directory: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Unable to create application data directory: {e}"))?;
    Ok(dir.join("mcp-credentials.dpapi"))
}

#[cfg(windows)]
fn protect_bytes(plain: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{GetLastError, LocalFree};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: plain
            .len()
            .try_into()
            .map_err(|_| "Credential payload is too large".to_string())?,
        pbData: plain.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &input,
            null(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(format!(
            "Windows DPAPI failed to protect MCP credentials (error {})",
            unsafe { GetLastError() }
        ));
    }

    let protected =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(output.pbData as *mut core::ffi::c_void);
    }
    Ok(protected)
}

#[cfg(windows)]
fn unprotect_bytes(protected: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{GetLastError, LocalFree};
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: protected
            .len()
            .try_into()
            .map_err(|_| "Credential payload is too large".to_string())?,
        pbData: protected.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(format!(
            "Windows DPAPI failed to decrypt MCP credentials (error {})",
            unsafe { GetLastError() }
        ));
    }

    let plain =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(output.pbData as *mut core::ffi::c_void);
    }
    Ok(plain)
}

#[cfg(not(windows))]
fn protect_bytes(_plain: &[u8]) -> Result<Vec<u8>, String> {
    Err("OS-protected MCP credential storage is not available on this platform".to_string())
}

#[cfg(not(windows))]
fn unprotect_bytes(_protected: &[u8]) -> Result<Vec<u8>, String> {
    Err("OS-protected MCP credential storage is not available on this platform".to_string())
}

fn read_vault(app: &tauri::AppHandle) -> Result<Map<String, Value>, String> {
    let path = vault_path(app)?;
    if !path.exists() {
        return Ok(Map::new());
    }
    let protected =
        std::fs::read(&path).map_err(|e| format!("Unable to read MCP credential vault: {e}"))?;
    let plain = unprotect_bytes(&protected)?;
    let value: Value = serde_json::from_slice(&plain)
        .map_err(|e| format!("MCP credential vault is invalid: {e}"))?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| "MCP credential vault root must be an object".to_string())
}

fn write_vault(app: &tauri::AppHandle, vault: &Map<String, Value>) -> Result<(), String> {
    let path = vault_path(app)?;
    let plain = serde_json::to_vec(&Value::Object(vault.clone()))
        .map_err(|e| format!("Unable to serialize MCP credentials: {e}"))?;
    let protected = protect_bytes(&plain)?;
    let tmp_name = format!(
        "{}.tmp",
        URL_SAFE_NO_PAD.encode(uuid::Uuid::new_v4().as_bytes())
    );
    let tmp = path.with_file_name(tmp_name);
    std::fs::write(&tmp, protected)
        .map_err(|e| format!("Unable to write MCP credential vault: {e}"))?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Unable to replace MCP credential vault: {e}"))?;
    }
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("Unable to commit MCP credential vault: {e}"))
}

fn merge_objects(target: &mut Map<String, Value>, patch: &Map<String, Value>) {
    for (key, value) in patch {
        if value.is_null() {
            target.remove(key);
        } else {
            target.insert(key.clone(), value.clone());
        }
    }
}

#[tauri::command]
pub fn mcp_secret_get(app: tauri::AppHandle, name: String) -> Result<Value, String> {
    if name.is_empty() || name.len() > 256 {
        return Err("MCP credential name must contain 1-256 characters".to_string());
    }
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "MCP credential vault lock is poisoned".to_string())?;
    let vault = read_vault(&app)?;
    Ok(vault
        .get(&name)
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new())))
}

#[tauri::command]
pub fn mcp_secret_merge(
    app: tauri::AppHandle,
    name: String,
    values: Value,
) -> Result<(), String> {
    if name.is_empty() || name.len() > 256 {
        return Err("MCP credential name must contain 1-256 characters".to_string());
    }
    if serde_json::to_vec(&values)
        .map_err(|e| format!("Unable to serialize MCP credentials: {e}"))?
        .len()
        > 1_048_576
    {
        return Err("MCP credential payload exceeds 1 MiB".to_string());
    }
    let patch = values
        .as_object()
        .ok_or_else(|| "MCP credentials must be a JSON object".to_string())?;
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "MCP credential vault lock is poisoned".to_string())?;
    let mut vault = read_vault(&app)?;
    let entry = vault
        .entry(name)
        .or_insert_with(|| Value::Object(Map::new()));
    let target = entry
        .as_object_mut()
        .ok_or_else(|| "Stored MCP credential entry is invalid".to_string())?;
    merge_objects(target, patch);
    write_vault(&app, &vault)
}

#[tauri::command]
pub fn mcp_secret_delete(app: tauri::AppHandle, name: String) -> Result<(), String> {
    if name.is_empty() || name.len() > 256 {
        return Err("MCP credential name must contain 1-256 characters".to_string());
    }
    let _guard = vault_lock()
        .lock()
        .map_err(|_| "MCP credential vault lock is poisoned".to_string())?;
    let mut vault = read_vault(&app)?;
    if vault.remove(&name).is_some() {
        write_vault(&app, &vault)?;
    }
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::{merge_objects, protect_bytes, unprotect_bytes};
    use serde_json::{json, Map};

    #[test]
    fn dpapi_round_trip_is_user_bound_and_lossless() {
        let plain = br#"{"authorization":"Bearer test-only"}"#;
        let protected = protect_bytes(plain).expect("DPAPI protection should succeed");
        assert_ne!(protected, plain);
        assert_eq!(
            unprotect_bytes(&protected).expect("DPAPI decryption should succeed"),
            plain
        );
    }

    #[test]
    fn secret_patch_replaces_values_and_removes_nulls() {
        let mut target = Map::from_iter([
            ("headers".to_string(), json!({"Authorization": "old"})),
            ("oauth".to_string(), json!({"tokens": {"access_token": "old"}})),
        ]);
        let patch = Map::from_iter([
            ("headers".to_string(), json!({"Authorization": "new"})),
            ("oauth".to_string(), json!(null)),
        ]);
        merge_objects(&mut target, &patch);
        assert_eq!(target.get("headers"), Some(&json!({"Authorization": "new"})));
        assert!(!target.contains_key("oauth"));
    }
}
