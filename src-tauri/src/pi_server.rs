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
            r"C:\Program Files\nodejs\node.exe".into(),
            r"C:\Program Files (x86)\nodejs\node.exe".into(),
            home.join("AppData").join("Roaming").join("npm").join("node.exe"),
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

    // 3. nvm: search ~/.nvm/versions/node/*/bin/node
    let nvm_versions = home.join(".nvm").join("versions").join("node");
    if nvm_versions.exists() {
        if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
            for entry in entries.flatten() {
                let node = entry.path().join("bin").join("node");
                if node.exists() {
                    return Some(node.to_string_lossy().to_string());
                }
            }
        }
    }

    // 4. fnm: search ~/.local/share/fnm/node-versions/*/installation/bin/node
    let fnm_versions = if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("fnm").join("node-versions")
    } else {
        home.join(".local").join("share").join("fnm").join("node-versions")
    };
    if fnm_versions.exists() {
        if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
            for entry in entries.flatten() {
                let node = entry.path().join("installation").join("bin").join("node");
                if node.exists() {
                    return Some(node.to_string_lossy().to_string());
                }
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
        if !std::path::Path::new(project_dir).exists() {
            return Err(format!("Project directory not found: {}", project_dir));
        }

        let node_path = std::env::var("PI_NODE_PATH")
            .ok()
            .and_then(|p| {
                let path = std::path::Path::new(&p);
                if path.exists() { Some(p) } else { None }
            })
            .or_else(find_node_cmd)
            .unwrap_or_else(|| "node".into());

        let mut cmd = Command::new(&node_path);

        // Resolve pi-server entry point — check both dev and production paths
        let dev_path = format!("{}/src-tauri/pi-server/index.mjs", project_dir);
        let prod_path = format!("{}/pi-server/index.mjs", project_dir);
        let entry = if std::path::Path::new(&dev_path).exists() {
            dev_path
        } else if std::path::Path::new(&prod_path).exists() {
            prod_path
        } else {
            return Err(format!(
                "pi-server not found at {} or {}. project_dir={}",
                dev_path, prod_path, project_dir
            ));
        };

        cmd.args([&entry]);
        cmd.env("PI_SERVER_PORT", port.to_string());
        cmd.current_dir(project_dir);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW (0x08000000): prevents the Node.js console
            // process from creating a visible window. We DON'T use
            // DETACHED_PROCESS here because that breaks the stdin pipe,
            // which pi-server uses to detect parent process exit.
            cmd.creation_flags(0x08000000);
        }

        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to start pi-server: {e}"))?;

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
