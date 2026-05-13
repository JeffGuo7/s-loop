use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct KiloProcess {
    child: Child,
    pub url: String,
}

pub struct KiloState(pub Mutex<Option<KiloProcess>>);

impl KiloProcess {
    pub fn start(kilo_repo: &str, port: u16, bun_path: &str) -> Result<Self, String> {
        let cwd = format!(
            "{}/packages/opencode",
            kilo_repo.trim_end_matches('/').trim_end_matches('\\')
        );

        let mut cmd = Command::new(bun_path);
        cmd.args([
            "run",
            "--cwd",
            &cwd,
            "--conditions=browser",
            "src/index.ts",
            "serve",
            &format!("--port={port}"),
            "--hostname=127.0.0.1",
        ]);

        // Windows: hide console window for the child process
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to start Kilo: {e}"))?;

        // Wait for server to print its listening line
        let stdout = child.stdout.take().ok_or("No stdout")?;
        let reader = std::io::BufReader::new(stdout);
        let mut url = String::new();

        for line in reader.lines() {
            let Ok(line) = line else {
                continue;
            };
            if line.contains("listening on") {
                // Extract URL from "kilo server listening on http://127.0.0.1:4096"
                if let Some(start) = line.find("http") {
                    url = line[start..].trim().to_string();
                } else {
                    url = format!("http://127.0.0.1:{port}");
                }
                break;
            }
            // If we see errors during startup, log them but keep waiting
            if line.contains("panic") || line.contains("Error:") {
                eprintln!("[kilo startup] {line}");
            }
        }

        if url.is_empty() {
            // Kill the child if we couldn't detect startup
            let _ = child.kill();
            return Err("Kilo server started but no listening URL detected".into());
        }

        // Re-attach stderr for logging (non-blocking)
        // stderr is dropped here which is fine - we don't need to read it

        Ok(Self {
            child,
            url,
        })
    }
}

impl Drop for KiloProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
