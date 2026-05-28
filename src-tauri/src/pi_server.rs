use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct PiServerProcess {
    child: Child,
    pub url: String,
}

pub struct PiServerState(pub Mutex<Option<PiServerProcess>>);

impl PiServerProcess {
    pub fn start(project_dir: &str, port: u16) -> Result<Self, String> {
        if !std::path::Path::new(project_dir).exists() {
            return Err(format!("Project directory not found: {}", project_dir));
        }

        let node_path = std::env::var("NODE_PATH").unwrap_or_else(|_| "node".into());

        let mut cmd = Command::new(&node_path);
        cmd.args([&format!("{}/pi-server/index.mjs", project_dir)]);
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
        let reader = std::io::BufReader::new(stdout);
        let mut url = String::new();

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
            return Err("pi-server started but no listening URL detected".into());
        }

        Ok(Self { child, url })
    }
}

impl Drop for PiServerProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
