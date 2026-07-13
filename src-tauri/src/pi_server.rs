use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

pub struct PiServerProcess {
    child: Option<Child>,
    pub url: String,
}

pub struct PiServerState(pub Arc<Mutex<Option<PiServerProcess>>>);

/// Marker file used to detect a fully extracted pi-server. We write it last so
/// a crash mid-extract leaves an incomplete directory that we will rebuild.
const EXTRACT_OK_MARKER: &str = ".extract-ok";

/// Ensure the pi-server directory exists under `base_dir`, extracting the
/// bundled `pi-server.zip` archive on first launch. Returns true when
/// `base_dir/pi-server/index.mjs` is usable afterwards.
///
/// In dev, the pi-server source directory is already present and the zip does
/// not exist, so this is a no-op (returns true).
pub fn ensure_pi_server_extracted(base_dir: &std::path::Path) -> Result<bool, String> {
    let pi_server_dir = base_dir.join("pi-server");
    let index_mjs = pi_server_dir.join("index.mjs");
    let marker = pi_server_dir.join(EXTRACT_OK_MARKER);

    // If pi-server is already usable (NSIS post-install may have pre-extracted
    // it without writing the marker), write the marker and return success.
    // This avoids deleting a working extraction just because the marker is missing.
    if index_mjs.exists() {
        if !marker.exists() {
            let _ = std::fs::write(&marker, b"ok");
        }
        return Ok(true);
    }

    let zip_path = base_dir.join("pi-server.zip");
    if !zip_path.exists() {
        eprintln!("[s-loop] pi-server.zip not found at {}", zip_path.display());
        return Ok(false);
    }

    eprintln!("[s-loop] extracting pi-server.zip at {} ...", base_dir.display());

    // Clean any partial/empty directory from a previous failed attempt.
    if pi_server_dir.exists() {
        std::fs::remove_dir_all(&pi_server_dir)
            .map_err(|e| format!("failed to remove stale pi-server dir: {e}"))?;
    }
    std::fs::create_dir_all(&pi_server_dir)
        .map_err(|e| format!("failed to create pi-server dir: {e}"))?;

    let file = std::fs::File::open(&zip_path)
        .map_err(|e| format!("failed to open pi-server.zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("failed to read pi-server.zip: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {i} read error: {e}"))?;
        let rel = entry.name().to_string();
        // Guard against path traversal in the archive (zipslip).
        let dest = pi_server_dir.join(&rel);
        let canonical_base = pi_server_dir.canonicalize().unwrap_or_else(|_| pi_server_dir.clone());
        if !dest
            .canonicalize()
            .unwrap_or_else(|_| dest.clone())
            .starts_with(&canonical_base)
        {
            return Err(format!("zip entry escapes pi-server dir: {rel}"));
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&dest)
                .map_err(|e| format!("failed to create dir {}: {e}", dest.display()))?;
            continue;
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("failed to create parent for {}: {e}", dest.display()))?;
        }
        let mut out = std::fs::File::create(&dest)
            .map_err(|e| format!("failed to create {}: {e}", dest.display()))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("failed to write {}: {e}", dest.display()))?;
    }

    // Write the completion marker last so a partial extract is detectable.
    std::fs::write(&marker, b"ok")
        .map_err(|e| format!("failed to write marker: {e}"))?;

    Ok(index_mjs.exists())
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Find the node executable by searching common installation paths.
/// GUI apps on all platforms may not inherit shell-configured PATH.
fn find_node_cmd() -> Option<String> {
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };

    // 1. Try the system's command locator
    let locator = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = Command::new(locator).arg(node_name).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().next() {
            let p = line.trim();
            if !p.is_empty() && std::path::Path::new(p).exists() {
                return Some(p.to_string());
            }
        }
    }

    // 2. Search common Node.js install directories
    let home = dirs_home();
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            // winget / official installer
            r"C:\Program Files\nodejs\node.exe".into(),
            r"C:\Program Files (x86)\nodejs\node.exe".into(),
            // nvm-windows alias (symlink or shim that always points to the active version)
            r"C:\ProgramData\nodejs\node.exe".into(),
            // alternate drive installs
            r"D:\Program Files\nodejs\node.exe".into(),
        ]
    } else {
        vec![
            "/usr/local/bin/node".into(),
            "/opt/homebrew/bin/node".into(),
            "/usr/bin/node".into(),
            home.join(".volta").join("bin").join("node"),
        ]
    };

    for candidate in &candidates {
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    // 3. nvm-windows: search %PROGRAMDATA%\nvm\v*\node.exe
    let nvm_win = std::path::Path::new(r"C:\ProgramData\nvm");
    if nvm_win.exists() {
        if let Ok(entries) = std::fs::read_dir(nvm_win) {
            for entry in entries.flatten() {
                let node = entry.path().join("node.exe");
                if node.exists() {
                    return Some(node.to_string_lossy().to_string());
                }
            }
        }
    }

    // 4. Unix nvm: search ~/.nvm/versions/node/*/bin/node
    let nvm_versions = home.join(".nvm").join("versions").join("node");
    if nvm_versions.exists() {
        if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
            for entry in entries.flatten() {
                let node = entry.path().join("bin").join(node_name);
                if node.exists() {
                    return Some(node.to_string_lossy().to_string());
                }
            }
        }
    }

    // 5. fnm: search ~/.local/share/fnm/node-versions/*/installation/bin/node
    let fnm_versions = if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("fnm").join("node-versions")
    } else {
        home.join(".local").join("share").join("fnm").join("node-versions")
    };
    if fnm_versions.exists() {
        if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
            for entry in entries.flatten() {
                let node = entry.path().join("installation").join("bin").join(node_name);
                if node.exists() {
                    return Some(node.to_string_lossy().to_string());
                }
            }
        }
    }

    // 6. Last resort: scan PATH environment variable for node
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join(node_name);
            if candidate.exists() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }

    None
}

impl PiServerProcess {
    #[allow(dead_code)]
    pub fn orphan(url: String) -> Self {
        Self { child: None, url }
    }

    pub fn start(project_dir: &str, port: u16) -> Result<Self, String> {
        // Normalize away the \\?\ verbatim prefix when present. Under it,
        // forward slashes are not treated as separators and some Node
        // path APIs behave unexpectedly; the plain path works everywhere.
        let project_dir_owned: String = {
            let p = project_dir.trim_start_matches(r"\\?\");
            p.to_string()
        };
        let project_dir = &project_dir_owned;

        if !std::path::Path::new(project_dir).exists() {
            return Err(format!("Project directory not found: {}", project_dir));
        }

        // Resolve pi-server entry point — check dev, production, and root paths.
        let base = PathBuf::from(project_dir);
        let dev_path = base.join("src-tauri").join("pi-server").join("index.mjs");
        let prod_path = base.join("pi-server").join("index.mjs");
        let root_path = base.join("index.mjs");
        let entry = if dev_path.exists() {
            dev_path
        } else if prod_path.exists() {
            prod_path
        } else if root_path.exists() {
            root_path
        } else {
            return Err(format!(
                "pi-server not found at {}, {} or {}. project_dir={}",
                dev_path.display(),
                prod_path.display(),
                root_path.display(),
                project_dir
            ));
        };

        // Resolve the node binary to use.
        // 1. PI_NODE_PATH env var (explicit override)
        // 2. Bundled node next to the entry script (self-contained, no system dep)
        // 3. System-installed node (find_node_cmd)
        // 4. Bare "node" as last resort
        let node_name = if cfg!(target_os = "windows") { "node.exe" } else { "node" };
        let bundled = entry.with_file_name(node_name);
        let node_path = std::env::var("PI_NODE_PATH")
            .ok()
            .and_then(|p| {
                let path = std::path::Path::new(&p);
                if path.exists() { Some(p) } else { None }
            })
            .or_else(|| {
                if bundled.exists() {
                    eprintln!("[s-loop] using bundled node: {}", bundled.display());
                    Some(bundled.to_string_lossy().to_string())
                } else {
                    None
                }
            })
            .or_else(find_node_cmd)
            .unwrap_or_else(|| {
                eprintln!("[s-loop] no node binary found, falling back to '{}'", node_name);
                node_name.into()
            });

        let mut cmd = Command::new(&node_path);

        cmd.arg(&entry);
        cmd.env("PI_SERVER_PORT", port.to_string());
        cmd.current_dir(project_dir);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            format!(
                "Failed to start pi-server: {e}\n\
                 Tried to run: {} {}\n\
                 If you are running from source, make sure Node.js is installed (https://nodejs.org).",
                node_path,
                entry.display()
            )
        })?;

        let stdout = child.stdout.take().ok_or("No stdout")?;
        let stderr = child.stderr.take().ok_or("No stderr")?;
        let diagnostics = Arc::new(Mutex::new(Vec::<String>::new()));
        let stdout_diagnostics = Arc::clone(&diagnostics);
        let stderr_diagnostics = Arc::clone(&diagnostics);
        let (ready_tx, ready_rx) = mpsc::channel::<String>();
        let mut url = String::new();

        std::thread::spawn(move || {
            let mut announced_ready = false;
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { continue };
                if let Ok(mut messages) = stdout_diagnostics.lock() {
                    if messages.len() >= 50 {
                        messages.remove(0);
                    }
                    messages.push(format!("stdout: {line}"));
                }
                eprintln!("[pi-server] {}", line);
                if !announced_ready && line.contains("listening on") {
                    let detected_url = if let Some(start) = line.find("http") {
                        line[start..].trim().to_string()
                    } else {
                        format!("http://127.0.0.1:{}", port)
                    };
                    let _ = ready_tx.send(detected_url);
                    announced_ready = true;
                }
            }
        });

        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                let Ok(line) = line else { continue };
                if let Ok(mut messages) = stderr_diagnostics.lock() {
                    if messages.len() >= 50 {
                        messages.remove(0);
                    }
                    messages.push(format!("stderr: {line}"));
                }
                if line.contains("Error:") || line.contains("error:") {
                    eprintln!("[pi-server] {}", line);
                }
            }
        });

        let start_time = Instant::now();
        let startup_timeout = Duration::from_secs(30);

        while url.is_empty() && start_time.elapsed() < startup_timeout {
            match ready_rx.recv_timeout(Duration::from_millis(250)) {
                Ok(detected_url) => {
                    url = detected_url;
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {}
            }

            if let Some(status) = child
                .try_wait()
                .map_err(|e| format!("Failed to inspect pi-server process: {e}"))?
            {
                let _ = status;
                break;
            }
        }

        if url.is_empty() {
            let _ = child.kill();
            let _ = child.wait();
            let details = if let Ok(messages) = diagnostics.lock() {
                if messages.is_empty() {
                    if start_time.elapsed() >= startup_timeout {
                        " (startup timed out waiting for listening URL)".into()
                    } else {
                        " (port may not have been released yet)".into()
                    }
                } else {
                    format!(": {}", messages.join(" | "))
                }
            } else {
                " (startup diagnostics unavailable)".into()
            };
            return Err(format!("pi-server started but no listening URL detected{}", details));
        }

        Ok(Self { child: Some(child), url })
    }
}

impl Drop for PiServerProcess {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
