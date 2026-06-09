use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

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
        cmd.args([&format!("{}/src-tauri/pi-server/index.mjs", project_dir)]);
        cmd.env("PI_SERVER_PORT", port.to_string());
        cmd.current_dir(project_dir);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to start pi-server: {e}"))?;

        let stdout = child.stdout.take().ok_or("No stdout")?;
        let stderr = child.stderr.take().ok_or("No stderr")?;
        let reader = std::io::BufReader::new(stdout);
        let err_reader = std::io::BufReader::new(stderr);
        let mut url = String::new();
        let mut errors = String::new();

        for line in reader.lines() {
            let Ok(line) = line else { continue };
            if line.contains("listening on") {
                if let Some(start) = line.find("http") {
                    url = line[start..].trim().to_string();
                } else {
                    url = format!("http://127.0.0.1:{}", port);
                }
                break;
            }
            if line.contains("Error:") || line.contains("error:") {
                eprintln!("[pi-server] {}", line);
            }
        }

        if url.is_empty() {
            let _ = child.kill();
            let _ = child.wait();
            // Drain stderr for diagnostics
            for line in err_reader.lines() {
                if let Ok(line) = line {
                    errors.push_str(&line);
                    errors.push('\n');
                }
            }
            let details = if !errors.is_empty() {
                format!(": {}", errors.trim())
            } else {
                " (port may not have been released yet)".into()
            };
            return Err(format!("pi-server started but no listening URL detected{}", details));
        }

        // Spawn a background thread to drain stderr so the pipe doesn't fill up
        std::thread::spawn(move || {
            for _line in err_reader.lines() {
                // discarded — just draining to prevent pipe deadlock
            }
        });

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
