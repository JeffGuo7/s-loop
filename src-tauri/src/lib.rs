mod kilo;

use crate::kilo::{KiloProcess, KiloState};
use std::sync::Mutex;

const KILO_PORT: u16 = 4096;

/// Check if Kilo is already running by testing the health endpoint
fn check_existing_kilo(port: u16) -> Option<String> {
    // Use a simple TCP check instead of HTTP to avoid dependencies
    if std::net::TcpStream::connect(format!("127.0.0.1:{port}")).is_ok() {
        // Port is open, assume Kilo is running
        Some(format!("http://127.0.0.1:{port}"))
    } else {
        None
    }
}

/// Start Kilo process with the given project directory
fn do_start_kilo(state: &KiloState, project_dir: &str) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("Kilo is already running".into());
    }

    // First check if Kilo is already running on the port
    if let Some(url) = check_existing_kilo(KILO_PORT) {
        eprintln!("[snotra] Found existing Kilo at {url}");
        return Ok(url);
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
            "C:\\Users\\tszyk\\.bun\\bin\\bun.exe",
            "C:\\Users\\tszyk\\AppData\\Roaming\\npm\\bun.cmd",
            "C:\\Program Files\\bun\\bun.exe",
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
        "bun".into() // fallback to PATH
    });

    let proc = KiloProcess::start(&kilo_repo, project_dir, KILO_PORT, &bun_path)?;
    let url = proc.url.clone();
    *guard = Some(proc);
    Ok(url)
}

#[tauri::command]
fn start_kilo(state: tauri::State<KiloState>) -> Result<String, String> {
    // Use SNOTRA_PROJECT_DIR or user home as project directory
    let project_dir = std::env::var("SNOTRA_PROJECT_DIR")
        .unwrap_or_else(|_| {
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".into())
        });
    do_start_kilo(&state, &project_dir)
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
    let state = KiloState(Mutex::new(None));

    // Get project directory once
    let project_dir = std::env::var("SNOTRA_PROJECT_DIR")
        .unwrap_or_else(|_| {
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".into())
        });

    // Start Kilo in background
    let state_for_setup = KiloState(Mutex::new(None));
    let project_dir_clone = project_dir.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            greet,
            start_kilo,
            stop_kilo,
            kilo_status,
            get_kilo_url,
        ])
        .setup(move |_app| {
            let project_dir_inner = project_dir_clone;
            tauri::async_runtime::spawn(async move {
                match do_start_kilo(&state_for_setup, &project_dir_inner) {
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
