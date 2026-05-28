mod ai_proxy;
mod commands;
mod mcp_manager;
mod opencode;
mod skill_installer;

use crate::mcp_manager::MCPManager;
use crate::opencode::{OpenCodeProcess, OpenCodeState};
use std::sync::Mutex;

const OPENCODE_PORT: u16 = 4096;

fn check_existing_opencode(port: u16) -> Option<String> {
    if std::net::TcpStream::connect(format!("127.0.0.1:{port}")).is_ok() {
        Some(format!("http://127.0.0.1:{port}"))
    } else {
        None
    }
}

fn do_start_opencode(state: &OpenCodeState, project_dir: &str) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("OpenCode is already running".into());
    }

    if let Some(url) = check_existing_opencode(OPENCODE_PORT) {
        eprintln!("[snotra] Found existing OpenCode at {url}");
        return Ok(url);
    }

    let proc = OpenCodeProcess::start(project_dir, OPENCODE_PORT)?;
    let url = proc.url.clone();
    *guard = Some(proc);
    Ok(url)
}

fn resolve_project_dir() -> String {
    std::env::var("SNOTRA_PROJECT_DIR").unwrap_or_else(|_| {
        std::env::current_dir()
            .map(|d| d.join("..").to_string_lossy().into_owned())
            .unwrap_or_else(|_| ".".into())
    })
}

#[tauri::command]
fn start_opencode(state: tauri::State<OpenCodeState>) -> Result<String, String> {
    let project_dir = resolve_project_dir();
    do_start_opencode(&state, &project_dir)
}

#[tauri::command]
fn stop_opencode(state: tauri::State<OpenCodeState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    drop(guard.take());
    Ok(())
}

#[tauri::command]
fn opencode_status(state: tauri::State<OpenCodeState>) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.is_some())
}

#[tauri::command]
fn get_opencode_url(state: tauri::State<OpenCodeState>) -> Result<Option<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|p| p.url.clone()))
}

// ---- MCP Commands ----

#[tauri::command]
fn mcp_connect(
    state: tauri::State<Mutex<MCPManager>>,
    name: String,
    command: String,
    args: Vec<String>,
) -> Result<mcp_manager::MCPServerStatus, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.connect(&name, &command, &args)
}

#[tauri::command]
fn mcp_disconnect(
    state: tauri::State<Mutex<MCPManager>>,
    name: String,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.disconnect(&name)
}

#[tauri::command]
fn mcp_refresh_tools(
    state: tauri::State<Mutex<MCPManager>>,
    name: String,
) -> Result<Vec<mcp_manager::MCPTool>, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.refresh_tools(&name)
}

#[tauri::command]
fn mcp_list_tools(
    state: tauri::State<Mutex<MCPManager>>,
    name: String,
) -> Result<Vec<mcp_manager::MCPTool>, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.list_tools(&name)
}

#[tauri::command]
fn mcp_call_tool(
    state: tauri::State<Mutex<MCPManager>>,
    name: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.call_tool(&name, &tool_name, arguments)
}

#[tauri::command]
fn mcp_list_servers(
    state: tauri::State<Mutex<MCPManager>>,
) -> Result<Vec<mcp_manager::MCPServerStatus>, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.list_servers()
}

#[tauri::command]
fn mcp_get_status(
    state: tauri::State<Mutex<MCPManager>>,
    name: String,
) -> Result<mcp_manager::MCPServerStatus, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.get_status(&name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = OpenCodeState(Mutex::new(None));

    let state_for_setup = OpenCodeState(Mutex::new(None));
    let project_dir = resolve_project_dir();
    let project_dir_clone = project_dir.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            greet,
            ai_proxy::ai_proxy,
            start_opencode,
            stop_opencode,
            opencode_status,
            get_opencode_url,
            commands::list_directory,
            commands::read_text_file,
            commands::scan_skill_files,
            commands::parse_skill_file,
            skill_installer::extract_skill_zip,
            mcp_connect,
            mcp_disconnect,
            mcp_refresh_tools,
            mcp_list_tools,
            mcp_call_tool,
            mcp_list_servers,
            mcp_get_status,
        ])
        .manage(Mutex::new(MCPManager::new()))
        .setup(move |_app| {
            let project_dir_inner = project_dir_clone;
            tauri::async_runtime::spawn(async move {
                match do_start_opencode(&state_for_setup, &project_dir_inner) {
                    Ok(url) => eprintln!("[snotra] OpenCode started at {url}"),
                    Err(e) => eprintln!("[snotra] OpenCode start failed: {e}"),
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
