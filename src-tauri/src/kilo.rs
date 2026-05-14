use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

pub struct KiloProcess {
    child: Child,
    pub url: String,
}

pub struct KiloState(pub Mutex<Option<KiloProcess>>);

impl KiloProcess {
    /// Start Kilo server
    /// - kilo_repo: path to kilocode-main repository (where Kilo source code lives)
    /// - project_dir: path to the project directory that Kilo should work with
    /// - port: port to listen on
    /// - bun_path: path to bun executable
    pub fn start(kilo_repo: &str, project_dir: &str, port: u16, bun_path: &str) -> Result<Self, String> {
        // The cwd for bun run is the Kilo source directory
        let kilo_cwd = format!(
            "{}/packages/opencode",
            kilo_repo.trim_end_matches('/').trim_end_matches('\\')
        );

        // Verify paths exist
        if !std::path::Path::new(&kilo_cwd).exists() {
            return Err(format!("Kilo source directory not found: {}", kilo_cwd));
        }
        if !std::path::Path::new(project_dir).exists() {
            return Err(format!("Project directory not found: {}", project_dir));
        }

        let mut cmd = Command::new(bun_path);
        cmd.args([
            "run",
            "--cwd",
            &kilo_cwd,
            "--conditions=browser",
            "src/index.ts",
            "serve",
            &format!("--port={port}"),
            "--hostname=127.0.0.1",
        ]);

        // Set the working directory to the project directory
        // This makes Kilo use this directory as its project root
        cmd.current_dir(project_dir);

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
