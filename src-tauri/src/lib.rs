mod commands;
mod mcp_manager;
mod pi_server;
mod skill_installer;

use crate::mcp_manager::MCPManager;
use crate::pi_server::{PiServerProcess, PiServerState};
use std::sync::{Arc, Mutex};

const PI_SERVER_PORT: u16 = 4096;
const PI_SERVER_PORT_SEARCH_LIMIT: u16 = 20;
const PI_SERVER_SERVICE_MARKER: &str = "\"service\":\"snotra-pi-server\"";

#[allow(dead_code)]
fn check_server_healthy(port: u16) -> bool {
    use std::io::{Read, Write};
    let mut stream = match std::net::TcpStream::connect(format!("127.0.0.1:{port}")) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let request = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.contains("200 OK")
        && response.contains("\"healthy\":true")
        && response.contains(PI_SERVER_SERVICE_MARKER)
}

fn port_from_url(url: &str) -> Option<u16> {
    url.rsplit(':')
        .next()
        .map(|segment| segment.trim_end_matches('/'))
        .and_then(|segment| segment.parse::<u16>().ok())
}

fn find_available_port(preferred: u16) -> Result<u16, String> {
    for offset in 0..=PI_SERVER_PORT_SEARCH_LIMIT {
        let port = preferred + offset;
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err(format!(
        "No available port found in range {}-{}",
        preferred,
        preferred + PI_SERVER_PORT_SEARCH_LIMIT
    ))
}

fn do_start_server(state: &PiServerState, project_dir: &str) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.as_ref() {
        if let Some(port) = port_from_url(&existing.url) {
            if check_server_healthy(port) {
                return Ok(existing.url.clone());
            }
        }
        drop(guard.take());
    }

    // Retry up to 3 times — port cleanup may take a moment on Windows
    let mut last_err = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
        let port = match find_available_port(PI_SERVER_PORT) {
            Ok(port) => port,
            Err(e) => {
                last_err = e;
                continue;
            }
        };

        if port != PI_SERVER_PORT {
            eprintln!(
                "[snotra] Preferred port {} is occupied, falling back to {}.",
                PI_SERVER_PORT, port
            );
        }

        match PiServerProcess::start(project_dir, port) {
            Ok(proc) => {
                let url = proc.url.clone();
                *guard = Some(proc);
                return Ok(url);
            }
            Err(e) => {
                eprintln!("[snotra] Start attempt {} failed: {}", attempt + 1, e);
                last_err = e;
            }
        }
    }

    Err(format!("pi-server failed to start after 3 attempts: {}", last_err))
}

fn resolve_project_dir() -> String {
    if let Some(dir) = std::env::var("SNOTRA_PROJECT_DIR").ok() {
        return dir;
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    let cwd_str = cwd.to_string_lossy();
    if cwd_str.ends_with("src-tauri") || cwd_str.ends_with("src-tauri\\") || cwd_str.ends_with("src-tauri/") {
        if let Some(parent) = cwd.parent() {
            return parent.to_string_lossy().into_owned();
        }
    }
    if std::path::Path::new(&cwd).join("src-tauri").join("pi-server").join("index.mjs").exists() {
        return cwd_str.into_owned();
    }
    if let Some(parent) = cwd.parent() {
        let candidate = parent.join("src-tauri").join("pi-server").join("index.mjs");
        if candidate.exists() {
            return parent.to_string_lossy().into_owned();
        }
    }
    cwd_str.into_owned()
}

#[tauri::command]
fn start_server(state: tauri::State<PiServerState>) -> Result<String, String> {
    let project_dir = resolve_project_dir();
    do_start_server(&state, &project_dir)
}

#[tauri::command]
fn stop_server(state: tauri::State<PiServerState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    drop(guard.take());
    Ok(())
}

#[tauri::command]
fn server_status(state: tauri::State<PiServerState>) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.as_ref() {
        if let Some(port) = port_from_url(&existing.url) {
            if check_server_healthy(port) {
                return Ok(true);
            }
        }
        drop(guard.take());
    }
    Ok(false)
}

// ---- MCP Commands ----

#[tauri::command]
fn mcp_connect(
    state: tauri::State<MCPManager>,
    name: String,
    command: String,
    args: Vec<String>,
) -> Result<mcp_manager::MCPServerStatus, String> {
    state.connect(&name, &command, &args)
}

#[tauri::command]
fn mcp_disconnect(
    state: tauri::State<MCPManager>,
    name: String,
) -> Result<(), String> {
    state.disconnect(&name)
}

#[tauri::command]
fn mcp_refresh_tools(
    state: tauri::State<MCPManager>,
    name: String,
) -> Result<Vec<mcp_manager::MCPTool>, String> {
    state.refresh_tools(&name)
}

#[tauri::command]
fn mcp_list_tools(
    state: tauri::State<MCPManager>,
    name: String,
) -> Result<Vec<mcp_manager::MCPTool>, String> {
    state.list_tools(&name)
}

#[tauri::command]
fn mcp_call_tool(
    state: tauri::State<MCPManager>,
    name: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    state.call_tool(&name, &tool_name, arguments)
}

#[tauri::command]
fn mcp_list_servers(
    state: tauri::State<MCPManager>,
) -> Result<Vec<mcp_manager::MCPServerStatus>, String> {
    state.list_servers()
}

#[tauri::command]
fn mcp_get_status(
    state: tauri::State<MCPManager>,
    name: String,
) -> Result<mcp_manager::MCPServerStatus, String> {
    state.get_status(&name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_state_arc = Arc::new(Mutex::new(None::<PiServerProcess>));
    let server_state = PiServerState(server_state_arc.clone());
    let project_dir = resolve_project_dir();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(server_state)
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            server_status,
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
        .manage(MCPManager::new())
        .setup(move |_app| {
            let state = PiServerState(server_state_arc);
            tauri::async_runtime::spawn(async move {
                match do_start_server(&state, &project_dir) {
                    Ok(url) => eprintln!("[snotra] pi-server started at {url}"),
                    Err(e) => eprintln!("[snotra] pi-server start failed: {e}"),
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
