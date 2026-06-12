mod commands;
mod mcp_manager;
mod pi_server;
mod skill_installer;

use crate::mcp_manager::MCPManager;
use crate::pi_server::{PiServerProcess, PiServerState};
use std::sync::{Arc, Mutex};

const PI_SERVER_PORT: u16 = 4096;

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
    response.contains("200 OK") || response.contains("healthy")
}

/// Kill any process listening on the given port (Windows only).
/// Parses netstat -ano output for the port and kills the owning PID.
/// Uses only the port number for matching — no locale-dependent strings.
#[cfg(windows)]
fn kill_process_on_port(port: u16) {
    use std::process::Command;
    let output = Command::new("netstat")
        .args(["-ano"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok());
    let Some(stdout) = output else { return };
    let port_str = format!(":{port}");
    for line in stdout.lines() {
        if !line.contains(&port_str) { continue; }
        let pid = line.split_whitespace().last().unwrap_or("");
        if let Ok(pid) = pid.parse::<u32>() {
            if pid > 0 {
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }
        }
    }
}

#[cfg(not(windows))]
fn kill_process_on_port(_port: u16) {
    // Non-Windows: use lsof + kill
    let _ = std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("lsof -ti :{_port} | xargs kill -9 2>/dev/null"))
        .output();
}

fn do_start_server(state: &PiServerState, project_dir: &str) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("pi-server is already running".into());
    }

    // Kill any process on our port to guarantee a fresh start
    if std::net::TcpStream::connect(format!("127.0.0.1:{PI_SERVER_PORT}")).is_ok() {
        eprintln!("[snotra] Killing old process on port {PI_SERVER_PORT}...");
        kill_process_on_port(PI_SERVER_PORT);
        // Wait up to 3 seconds for the port to be fully released
        for _ in 0..6 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if std::net::TcpStream::connect(format!("127.0.0.1:{PI_SERVER_PORT}")).is_err() {
                break;
            }
            eprintln!("[snotra] Port still occupied, waiting...");
        }
    }

    // Retry up to 3 times — port cleanup may take a moment on Windows
    let mut last_err = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
        match PiServerProcess::start(project_dir, PI_SERVER_PORT) {
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
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.is_some())
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
        .manage(Mutex::new(MCPManager::new()))
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
