use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct OpenCodeProcess {
    child: Child,
    pub url: String,
}

pub struct OpenCodeState(pub Mutex<Option<OpenCodeProcess>>);

impl OpenCodeProcess {
    /// Start OpenCode server using npm package opencode-ai
    pub fn start(project_dir: &str, port: u16) -> Result<Self, String> {
        if !std::path::Path::new(project_dir).exists() {
            return Err(format!("Project directory not found: {}", project_dir));
        }

        let npx_path = std::env::var("NPX_PATH").unwrap_or_else(|_| {
            let candidates = [
                "C:\\ProgramData\\nodejs\\npx.cmd",
                "C:\\nvm4w\\nodejs\\npx.cmd",
                "C:\\Program Files\\nodejs\\npx.cmd",
                "D:\\Program Files\\nodejs\\npx.cmd",
            ];
            for path in &candidates {
                if std::path::Path::new(path).exists() {
                    return path.to_string();
                }
            }
            "npx".into()
        });

        let mut cmd = Command::new(&npx_path);
        cmd.args([
            "-y",
            "opencode-ai",
            "serve",
            &format!("--port={}", port),
            "--hostname=127.0.0.1",
        ]);

        cmd.current_dir(project_dir);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to start OpenCode (npx: {}): {e}", npx_path))?;

        let stdout = child.stdout.take().ok_or("No stdout")?;
        let reader = std::io::BufReader::new(stdout);
        let mut url = String::new();

        for line in reader.lines() {
            let Ok(line) = line else {
                continue;
            };
            if line.contains("listening on") || line.contains("Listening on") {
                if let Some(start) = line.find("http") {
                    url = line[start..].trim().to_string();
                } else {
                    url = format!("http://127.0.0.1:{}", port);
                }
                break;
            }
            if line.contains("panic") || line.contains("Error:") {
                eprintln!("[opencode startup] {}", line);
            }
        }

        if url.is_empty() {
            let _ = child.kill();
            return Err("OpenCode server started but no listening URL detected".into());
        }

        Ok(Self {
            child,
            url,
        })
    }
}

impl Drop for OpenCodeProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
