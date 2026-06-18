use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

pub struct PiServerProcess {
    child: Option<Child>,
    pub url: String,
}

pub struct PiServerState(pub Arc<Mutex<Option<PiServerProcess>>>);

impl PiServerProcess {
    #[allow(dead_code)]
    pub fn orphan(url: String) -> Self {
        Self { child: None, url }
    }

    pub fn start(project_dir: &str, port: u16) -> Result<Self, String> {
        if !std::path::Path::new(project_dir).exists() {
            return Err(format!("Project directory not found: {}", project_dir));
        }

        let node_path = std::env::var("PI_NODE_PATH").unwrap_or_else(|_| "node".into());

        let mut cmd = Command::new(&node_path);
        cmd.args(["--watch", &format!("{}/src-tauri/pi-server/index.mjs", project_dir)]);
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
                if line.contains("Error:") || line.contains("error:") {
                    eprintln!("[pi-server] {}", line);
                }
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
