mod commands;
mod mcp_manager;
mod skill_installer;

use crate::mcp_manager::MCPManager;
use std::sync::Mutex;

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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
