mod commands;
mod credential_store;
mod dictation;
mod mcp_manager;
mod pi_server;
mod skill_installer;
mod skills_cli;

use crate::mcp_manager::MCPManager;
use crate::pi_server::{ensure_pi_server_extracted, PiServerProcess, PiServerState};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

const PI_SERVER_PORT: u16 = 4096;
const PI_SERVER_PORT_SEARCH_LIMIT: u16 = 20;
const PI_SERVER_SERVICE_MARKER: &str = "\"service\":\"s-loop-pi-server\"";

struct AppLifecycleState {
    exiting: AtomicBool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PiServerConnection {
    url: String,
    api_token: String,
}

#[allow(dead_code)]
fn check_server_healthy(port: u16) -> bool {
    use std::io::{Read, Write};
    let mut stream = match std::net::TcpStream::connect(format!("127.0.0.1:{port}")) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
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

fn do_start_server(
    state: &PiServerState,
    runtime_dir: &str,
    workspace_dir: &str,
) -> Result<PiServerConnection, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.as_ref() {
        if let Some(port) = port_from_url(&existing.url) {
            if check_server_healthy(port) {
                return Ok(PiServerConnection {
                    url: existing.url.clone(),
                    api_token: existing.api_token.clone(),
                });
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
                "[s-loop] Preferred port {} is occupied, falling back to {}.",
                PI_SERVER_PORT, port
            );
        }

        match PiServerProcess::start(runtime_dir, workspace_dir, port) {
            Ok(proc) => {
                let connection = PiServerConnection {
                    url: proc.url.clone(),
                    api_token: proc.api_token.clone(),
                };
                *guard = Some(proc);
                return Ok(connection);
            }
            Err(e) => {
                eprintln!("[s-loop] Start attempt {} failed: {}", attempt + 1, e);
                last_err = e;
            }
        }
    }

    Err(format!(
        "pi-server failed to start after 3 attempts: {}",
        last_err
    ))
}

fn resolve_project_dir() -> String {
    if let Some(dir) = std::env::var("S_LOOP_PROJECT_DIR").ok() {
        return dir;
    }
    if let Some(dir) = std::env::var("SNOTRA_PROJECT_DIR").ok() {
        return dir;
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    let cwd_str = cwd.to_string_lossy();
    if cwd_str.ends_with("src-tauri")
        || cwd_str.ends_with("src-tauri\\")
        || cwd_str.ends_with("src-tauri/")
    {
        if let Some(parent) = cwd.parent() {
            return parent.to_string_lossy().into_owned();
        }
    }
    if std::path::Path::new(&cwd)
        .join("src-tauri")
        .join("pi-server")
        .join("index.mjs")
        .exists()
    {
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

fn resolve_workspace_dir(project_dir: &str, app: &tauri::AppHandle) -> String {
    let project_path = std::path::Path::new(project_dir);
    let is_source_checkout = project_path
        .join("src-tauri")
        .join("pi-server")
        .join("index.mjs")
        .exists()
        || project_path.join("pi-server").join("index.mjs").exists();
    if is_source_checkout {
        return project_dir.to_string();
    }

    // A packaged app should not use its installation directory as the
    // pi-server data directory. Shortcuts may set the working directory to
    // Program Files or even System32, both of which are unsuitable for writes.
    app.path()
        .app_data_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| project_dir.to_string())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(true) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "tray_show", "打开 S-Loop", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "tray_hide", "隐藏到后台", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray_quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon")?;

    TrayIconBuilder::with_id("s-loop-tray")
        .icon(icon)
        .tooltip("S-Loop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(&tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_show" => show_main_window(app),
            "tray_hide" => hide_main_window(app),
            "tray_quit" => {
                if let Some(state) = app.try_state::<AppLifecycleState>() {
                    state.exiting.store(true, Ordering::Relaxed);
                }
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn pi_server_in(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    // Accept both the subdir layout (pi-server/index.mjs, the one we ship)
    // and the flat layout (index.mjs at the root).
    let subdir = dir.join("pi-server").join("index.mjs");
    if subdir.exists() {
        return Some(subdir);
    }
    let flat = dir.join("index.mjs");
    if flat.exists() {
        return Some(flat);
    }
    None
}

fn find_pi_server_entry(project_dir: &str, app_handle: Option<&tauri::AppHandle>) -> String {
    // 1. Dev path: {project_dir}/src-tauri/pi-server/index.mjs
    let dev = std::path::Path::new(project_dir)
        .join("src-tauri")
        .join("pi-server")
        .join("index.mjs");
    if dev.exists() {
        eprintln!("[s-loop] pi-server found at dev path: {}", dev.display());
        return project_dir.to_string();
    }

    // 2. Relative subdir: {project_dir}/pi-server/index.mjs
    let rel = std::path::Path::new(project_dir)
        .join("pi-server")
        .join("index.mjs");
    if rel.exists() {
        eprintln!(
            "[s-loop] pi-server found at relative path: {}",
            rel.display()
        );
        return project_dir.to_string();
    }

    // 3. Root level: {project_dir}/index.mjs (pi-server files extracted to install root)
    let root = std::path::Path::new(project_dir).join("index.mjs");
    if root.exists() {
        eprintln!("[s-loop] pi-server found at root: {}", root.display());
        return project_dir.to_string();
    }

    // Collect candidate directories where pi-server.zip or extracted pi-server may live.
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    // 4a. Tauri resource_dir — where `bundle.resources` files are placed.
    if let Some(app) = app_handle {
        match app.path().resource_dir() {
            Ok(res) => {
                eprintln!("[s-loop] resource_dir = {}", res.display());
                candidates.push(res);
            }
            Err(e) => eprintln!("[s-loop] resource_dir unavailable: {e}"),
        }
    }

    // 4b. Exe directory — reliable fallback for packaged apps.
    match std::env::current_exe() {
        Ok(exe) => {
            if let Some(dir) = exe.parent() {
                let clean = dir
                    .to_string_lossy()
                    .trim_start_matches(r"\\?\")
                    .to_string();
                eprintln!("[s-loop] exe_dir = {}", clean);
                candidates.push(dir.to_path_buf());
            }
        }
        Err(e) => eprintln!("[s-loop] current_exe unavailable: {e}"),
    }

    // Deduplicate candidates (resource_dir often equals exe_dir for NSIS).
    let mut seen = std::collections::HashSet::new();
    candidates.retain(|p| seen.insert(p.to_string_lossy().to_string()));

    // Prefer a per-user runtime directory. The installation folder may be
    // read-only under Program Files, while app data is writable for both MSI
    // and NSIS installs.
    if let Some(app) = app_handle {
        if let Ok(data_dir) = app.path().app_data_dir() {
            let runtime_dir = data_dir.join("runtime");
            for candidate in &candidates {
                let archive = candidate.join("pi-server.zip");
                match crate::pi_server::ensure_pi_server_extracted_to(&archive, &runtime_dir) {
                    Ok(true) if pi_server_in(&runtime_dir).is_some() => {
                        eprintln!(
                            "[s-loop] pi-server ready in app data: {}",
                            runtime_dir.display()
                        );
                        return runtime_dir.to_string_lossy().into_owned();
                    }
                    Ok(false) => {}
                    Ok(true) => eprintln!("[s-loop] extracted runtime has no entry point"),
                    Err(e) => eprintln!(
                        "[s-loop] app-data extraction failed at {}: {e}",
                        archive.display()
                    ),
                }
            }
        }
    }

    // Legacy fallback: extract beside the executable/resource when app data
    // is unavailable, or reuse an older pre-extracted installation.
    // Try each candidate: extract if zip is present, then check for pi-server.
    for candidate in &candidates {
        match ensure_pi_server_extracted(candidate) {
            Ok(true) => {
                if pi_server_in(candidate).is_some() {
                    let clean = candidate
                        .to_string_lossy()
                        .trim_start_matches(r"\\?")
                        .to_string();
                    eprintln!("[s-loop] pi-server ready at: {}", clean);
                    return clean;
                }
            }
            Ok(false) => {
                eprintln!("[s-loop] no pi-server.zip at {}", candidate.display());
            }
            Err(e) => {
                eprintln!(
                    "[s-loop] pi-server extract failed at {}: {e}",
                    candidate.display()
                );
            }
        }
    }

    // If no candidate had the zip but one candidate has the extracted
    // pi-server (e.g. NSIS post-install already extracted it), try again
    // without requiring the zip.
    for candidate in &candidates {
        if pi_server_in(candidate).is_some() {
            let clean = candidate
                .to_string_lossy()
                .trim_start_matches(r"\\?")
                .to_string();
            eprintln!("[s-loop] pi-server found (pre-extracted) at: {}", clean);
            return clean;
        }
    }

    // 5. Fallback: return project_dir so the caller can report a clear error.
    eprintln!(
        "[s-loop] pi-server not found in any candidate dir, falling back to project_dir={}",
        project_dir
    );
    project_dir.to_string()
}

#[tauri::command]
fn start_server(
    state: tauri::State<PiServerState>,
    app: tauri::AppHandle,
) -> Result<PiServerConnection, String> {
    let project_dir = resolve_project_dir();
    let workspace_dir = resolve_workspace_dir(&project_dir, &app);
    let runtime_dir = find_pi_server_entry(&project_dir, Some(&app));
    do_start_server(&state, &runtime_dir, &workspace_dir)
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

#[tauri::command]
fn runtime_diagnostics(app: tauri::AppHandle) -> serde_json::Value {
    let workspace_dir = resolve_project_dir();
    let runtime_dir = find_pi_server_entry(&workspace_dir, Some(&app));
    let runtime_path = std::path::Path::new(&runtime_dir);
    let entry = [
        runtime_path.join("pi-server").join("index.mjs"),
        runtime_path.join("index.mjs"),
    ]
    .into_iter()
    .find(|path| path.exists());
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    let bundled_node = entry.as_ref().map(|path| path.with_file_name(node_name));
    let node_version = bundled_node.as_ref().and_then(|path| {
        std::process::Command::new(path)
            .arg("--version")
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
    });
    let resource_dir = app.path().resource_dir().ok();
    let app_data_dir = app.path().app_data_dir().ok();

    serde_json::json!({
        "workspaceDir": workspace_dir,
        "runtimeDir": runtime_dir,
        "entry": entry.map(|path| path.to_string_lossy().into_owned()),
        "bundledNode": bundled_node.as_ref().map(|path| path.to_string_lossy().into_owned()),
        "bundledNodeExists": bundled_node.as_ref().is_some_and(|path| path.exists()),
        "nodeVersion": node_version,
        "archive": resource_dir.as_ref().map(|dir| dir.join("pi-server.zip").to_string_lossy().into_owned()),
        "archiveExists": resource_dir.is_some_and(|dir| dir.join("pi-server.zip").exists()),
        "appDataDir": app_data_dir.map(|path| path.to_string_lossy().into_owned()),
        "debugBuild": cfg!(debug_assertions),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

// ---- MCP Commands ----

#[tauri::command]
fn mcp_connect(
    state: tauri::State<MCPManager>,
    name: String,
    command: String,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
) -> Result<mcp_manager::MCPServerStatus, String> {
    state.connect(&name, &command, &args, &env)
}

#[tauri::command]
fn mcp_disconnect(state: tauri::State<MCPManager>, name: String) -> Result<(), String> {
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is launched, focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(server_state)
        .manage(AppLifecycleState {
            exiting: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            server_status,
            runtime_diagnostics,
            commands::list_directory,
            commands::read_text_file,
            commands::read_file_base64,
            commands::scan_skill_files,
            commands::parse_skill_file,
            commands::search_remote_skills,
            commands::download_remote_skill_archive,
            credential_store::mcp_secret_get,
            credential_store::mcp_secret_merge,
            credential_store::mcp_secret_delete,
            skills_cli::skills_cli_search,
            skills_cli::clawhub_install_skill,
            skills_cli::skills_cli_update,
            skills_cli::skills_cli_remove,
            skills_cli::delete_skill_files,
            skills_cli::create_skill_file,
            skills_cli::skills_mirror_config,
            skill_installer::extract_skill_zip,
            mcp_connect,
            mcp_disconnect,
            mcp_refresh_tools,
            mcp_list_tools,
            mcp_call_tool,
            mcp_list_servers,
            mcp_get_status,
            dictation::get_dictation_status,
            dictation::start_dictation,
            dictation::stop_dictation,
            dictation::cancel_dictation,
            dictation::download_dictation_model,
            dictation::cancel_dictation_model_download,
            dictation::verify_dictation_model,
            dictation::mark_dictation_test_passed,
            dictation::delete_dictation_model,
            dictation::dictation_level,
        ])
        .manage(MCPManager::new())
        .setup(move |app| {
            dictation::initialize(app)?;
            // Handle close → minimize (hide) behavior: clicking X should
            // hide the window to system tray, not quit the app.
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
            }
            setup_tray(app).map_err(|e| e.to_string())?;
            let state = PiServerState(server_state_arc);
            let workspace_dir = resolve_workspace_dir(&project_dir, app.handle());
            let actual_project_dir = find_pi_server_entry(&project_dir, Some(app.handle()));
            tauri::async_runtime::spawn(async move {
                match do_start_server(&state, &actual_project_dir, &workspace_dir) {
                    Ok(connection) => {
                        eprintln!("[s-loop] pi-server started at {}", connection.url)
                    }
                    Err(e) => eprintln!("[s-loop] pi-server start failed: {e}"),
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.app_handle().try_state::<AppLifecycleState>() {
                    if !state.exiting.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
