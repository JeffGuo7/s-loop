use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct KiloProcess {
    child: Child,
    pub url: String,
}

pub struct KiloState(pub Mutex<Option<KiloProcess>>);

impl KiloProcess {
    /// Start Kilo server using npm package @kilocode/cli
    /// - project_dir: path to the project directory that Kilo should work with
    /// - port: port to listen on
    pub fn start(project_dir: &str, port: u16) -> Result<Self, String> {
        // Verify project directory exists
        if !std::path::Path::new(project_dir).exists() {
            return Err(format!("Project directory not found: {}", project_dir));
        }

        // Find npx - try common locations
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
            "npx".into() // fallback to PATH
        });

        // Use npx to run @kilocode/cli serve
        let mut cmd = Command::new(&npx_path);
        cmd.args([
            "kilo",
            "serve",
            &format!("--port={}", port),
            "--hostname=127.0.0.1",
        ]);

        // Set the working directory to the project directory
        cmd.current_dir(project_dir);

        // Windows: hide console window for the child process
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to start Kilo (npx: {}): {e}", npx_path))?;

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
                    url = format!("http://127.0.0.1:{}", port);
                }
                break;
            }
            // If we see errors during startup, log them but keep waiting
            if line.contains("panic") || line.contains("Error:") {
                eprintln!("[kilo startup] {}", line);
            }
        }

        if url.is_empty() {
            // Kill the child if we couldn't detect startup
            let _ = child.kill();
            return Err("Kilo server started but no listening URL detected".into());
        }

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
