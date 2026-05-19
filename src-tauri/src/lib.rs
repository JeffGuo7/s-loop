mod commands;
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

    let proc = KiloProcess::start(project_dir, KILO_PORT)?;
    let url = proc.url.clone();
    *guard = Some(proc);
    Ok(url)
}

/// Resolve the Snotra project directory (where node_modules/@kilocode/cli lives)
fn resolve_project_dir() -> String {
    std::env::var("SNOTRA_PROJECT_DIR").unwrap_or_else(|_| {
        // During tauri dev, current_dir is src-tauri/, parent is Snotra root
        std::env::current_dir()
            .map(|d| d.join("..").to_string_lossy().into_owned())
            .unwrap_or_else(|_| ".".into())
    })
}

#[tauri::command]
fn start_kilo(state: tauri::State<KiloState>) -> Result<String, String> {
    let project_dir = resolve_project_dir();
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

    // Start Kilo in background
    let state_for_setup = KiloState(Mutex::new(None));
    let project_dir = resolve_project_dir();
    let project_dir_clone = project_dir.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            greet,
            start_kilo,
            stop_kilo,
            kilo_status,
            get_kilo_url,
            commands::list_directory,
            commands::read_text_file,
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
