mod kilo;

use crate::kilo::{KiloProcess, KiloState};
use std::sync::Mutex;
use tauri::Manager;

const KILO_PORT: u16 = 4096;

#[tauri::command]
fn start_kilo(state: tauri::State<KiloState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("Kilo is already running".into());
    }

    let kilo_repo = std::env::var("KILO_DEV_REPO").unwrap_or_else(|_| {
        std::env::current_dir()
            .map(|d| {
                d.join("..")
                    .join("..")
                    .join("kilocode-main")
                    .to_string_lossy()
                    .into_owned()
            })
            .unwrap_or_else(|_| "../kilocode-main".into())
    });

    let bun_path = std::env::var("BUN_PATH").unwrap_or_else(|_| {
        // Try known bun install paths
        let candidates = [
            "D:\\Program Files\\nodejs\\node_cache\\node_modules\\bun\\bin\\bun.exe",
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
        "bun".into() // fallback to PATH
    });

    let proc = KiloProcess::start(&kilo_repo, KILO_PORT, &bun_path)?;
    let url = proc.url.clone();
    *guard = Some(proc);
    Ok(url)
}

#[tauri::command]
fn stop_kilo(state: tauri::State<KiloState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    drop(guard.take()); // Kill+wait via Drop
    Ok(())
}

#[tauri::command]
fn kilo_status(state: tauri::State<KiloState>) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.is_some())
}

#[tauri::command]
fn get_kilo_url(state: tauri::State<KiloState>) -> Result<Option<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|p| p.url.clone()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(KiloState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            greet,
            start_kilo,
            stop_kilo,
            kilo_status,
            get_kilo_url,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match start_kilo(handle.state()) {
                    Ok(url) => eprintln!("[snotra] Kilo started at {url}"),
                    Err(e) => eprintln!("[snotra] Kilo start failed: {e}"),
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}
