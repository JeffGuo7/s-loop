use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex, RwLock};
use std::time::Duration;

// ---- Data Types ----

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct MCPTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct MCPServerStatus {
    pub name: String,
    pub status: String,
    pub error: Option<String>,
    pub tools: Vec<MCPTool>,
}

// ---- Internal Process Manager ----

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_DIAGNOSTIC_LINES: usize = 50;

fn push_diagnostic(diagnostics: &Arc<Mutex<Vec<String>>>, stream: &str, line: String) {
    if let Ok(mut messages) = diagnostics.lock() {
        if messages.len() >= MAX_DIAGNOSTIC_LINES {
            messages.remove(0);
        }
        messages.push(format!("{stream}: {line}"));
    }
}

struct MCPServerProcess {
    name: String,
    child: Child,
    response_rx: mpsc::Receiver<Result<String, String>>,
    writer: ChildStdin,
    tools: Vec<MCPTool>,
    diagnostics: Arc<Mutex<Vec<String>>>,
}

impl MCPServerProcess {
    fn start(name: &str, command: &str, args: &[String]) -> Result<Self, String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn MCP server '{}': {}", name, e))?;

        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
        let diagnostics = Arc::new(Mutex::new(Vec::new()));
        let response_rx = Self::spawn_stdout_reader(name, stdout, Arc::clone(&diagnostics));
        Self::spawn_stderr_drain(name, stderr, Arc::clone(&diagnostics));
        let writer = stdin;

        let mut process = Self {
            name: name.to_string(),
            child,
            response_rx,
            writer,
            tools: Vec::new(),
            diagnostics,
        };

        // Step 1: Initialize
        let result = process.send_request(
            1,
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "s-loop", "version": "1.0.0" }
            }),
        )?;

        let server_info = result.get("serverInfo").and_then(|i| i.get("name")).and_then(|n| n.as_str()).unwrap_or("unknown");
        let protocol_version = result.get("protocolVersion").and_then(|v| v.as_str()).unwrap_or("unknown");
        eprintln!("[s-loop:mcp] Server '{}' connected: name={}, protocol={}", name, server_info, protocol_version);

        // Step 2: Send initialized notification (no response expected)
        let notif = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        let mut notif_str = serde_json::to_string(&notif).map_err(|e| e.to_string())?;
        notif_str.push('\n');
        process
            .writer
            .write_all(notif_str.as_bytes())
            .map_err(|e| e.to_string())?;
        process
            .writer
            .flush()
            .map_err(|e| e.to_string())?;

        Ok(process)
    }

    fn spawn_stdout_reader(
        name: &str,
        stdout: ChildStdout,
        diagnostics: Arc<Mutex<Vec<String>>>,
    ) -> mpsc::Receiver<Result<String, String>> {
        let (tx, rx) = mpsc::channel();
        let server_name = name.to_string();

        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) => {
                        push_diagnostic(&diagnostics, "stdout", line.clone());
                        if tx.send(Ok(line)).is_err() {
                            break;
                        }
                    }
                    Err(err) => {
                        let message = format!(
                            "Failed to read response from MCP server '{}': {}",
                            server_name, err
                        );
                        push_diagnostic(&diagnostics, "stdout", message.clone());
                        let _ = tx.send(Err(message));
                        break;
                    }
                }
            }
        });

        rx
    }

    fn spawn_stderr_drain(
        name: &str,
        stderr: std::process::ChildStderr,
        diagnostics: Arc<Mutex<Vec<String>>>,
    ) {
        let server_name = name.to_string();

        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                match line {
                    Ok(line) => {
                        push_diagnostic(&diagnostics, "stderr", line.clone());
                        eprintln!("[s-loop:mcp:{}] {}", server_name, line);
                    }
                    Err(err) => {
                        let message =
                            format!("Failed to drain stderr from MCP server '{}': {}", server_name, err);
                        push_diagnostic(&diagnostics, "stderr", message.clone());
                        eprintln!("[s-loop:mcp:{}] {}", server_name, message);
                        break;
                    }
                }
            }
        });
    }

    fn diagnostics_summary(&self) -> String {
        if let Ok(messages) = self.diagnostics.lock() {
            if messages.is_empty() {
                String::new()
            } else {
                format!(" | diagnostics: {}", messages.join(" | "))
            }
        } else {
            String::new()
        }
    }

    fn send_request(&mut self, id: u64, method: &str, params: Value) -> Result<Value, String> {
        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });

        let mut req_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        req_str.push('\n');
        self.writer
            .write_all(req_str.as_bytes())
            .map_err(|e| e.to_string())?;
        self.writer.flush().map_err(|e| e.to_string())?;

        loop {
            let line = match self.response_rx.recv_timeout(REQUEST_TIMEOUT) {
                Ok(Ok(line)) => line,
                Ok(Err(err)) => return Err(err),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    return Err(format!(
                        "Timed out waiting for MCP server '{}' to respond to '{}'/id={}{}",
                        self.name,
                        method,
                        id,
                        self.diagnostics_summary()
                    ))
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(format!(
                        "MCP server '{}' disconnected while waiting for '{}'{}",
                        self.name,
                        method,
                        self.diagnostics_summary()
                    ))
                }
            };

            if line.trim().is_empty() {
                continue;
            }

            let response: Result<Value, _> = serde_json::from_str(&line);
            let response = match response {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[s-loop:mcp] JSON parse error: {} | line: {}", e, line.trim());
                    continue;
                }
            };

            let response_id = response.get("id");
            match response_id {
                Some(Value::Number(n)) if n.as_u64() == Some(id) => {
                    if let Some(error) = response.get("error") {
                        let code = error.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
                        let msg = error
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("Unknown error");
                        return Err(format!("MCP error (code {}): {}", code, msg));
                    }
                    return Ok(response.get("result").cloned().unwrap_or(json!(null)));
                }
                Some(Value::Number(_)) => {
                    eprintln!("[s-loop:mcp] Unexpected response ID for request {} on method {}", id, method);
                    continue;
                }
                _ => {
                    continue;
                }
            }
        }
    }

    fn call_tool(&mut self, tool_name: &str, arguments: Value) -> Result<Value, String> {
        self.send_request(
            3,
            "tools/call",
            json!({
                "name": tool_name,
                "arguments": arguments
            }),
        )
    }

    fn refresh_tools(&mut self) -> Result<Vec<MCPTool>, String> {
        let result = self.send_request(2, "tools/list", json!({}))?;
        if let Some(tools_array) = result.get("tools").and_then(|t| t.as_array()) {
            let tools: Vec<MCPTool> = tools_array
                .iter()
                .map(|t| MCPTool {
                    name: t.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string(),
                    description: t.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                    input_schema: t.get("inputSchema").cloned().unwrap_or(json!({})),
                })
                .collect();
            self.tools = tools.clone();
            Ok(tools)
        } else {
            Ok(Vec::new())
        }
    }

    fn shutdown(&mut self) {
        // Send shutdown request (fire and forget)
        if let Ok(request) = serde_json::to_string(&json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "shutdown",
            "params": {}
        })) {
            let _ = writeln!(self.writer, "{}", request);
            let _ = self.writer.flush();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

// ---- Global State ----

struct ServerHandle {
    process: Mutex<MCPServerProcess>,
}

pub struct MCPManager {
    processes: RwLock<HashMap<String, Arc<ServerHandle>>>,
}

impl MCPManager {
    pub fn new() -> Self {
        Self {
            processes: RwLock::new(HashMap::new()),
        }
    }

    fn get_handle(&self, name: &str) -> Result<Arc<ServerHandle>, String> {
        let processes = self.processes.read().map_err(|e| e.to_string())?;
        processes
            .get(name)
            .cloned()
            .ok_or_else(|| format!("Server '{}' not connected", name))
    }

    fn with_process<T, F>(&self, name: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut MCPServerProcess) -> Result<T, String>,
    {
        let handle = self.get_handle(name)?;
        let mut process = handle.process.lock().map_err(|e| e.to_string())?;
        f(&mut process)
    }

    pub fn connect(
        &self,
        name: &str,
        command: &str,
        args: &[String],
    ) -> Result<MCPServerStatus, String> {
        let existing = {
            let mut processes = self.processes.write().map_err(|e| e.to_string())?;
            processes.remove(name)
        };

        if let Some(existing) = existing {
            let mut process = existing.process.lock().map_err(|e| e.to_string())?;
            process.shutdown();
        }

        let process = MCPServerProcess::start(name, command, args)
            .map_err(|e| format!("Connection failed: {}", e))?;
        let status = MCPServerStatus {
            name: name.to_string(),
            status: "connected".to_string(),
            error: None,
            tools: process.tools.clone(),
        };

        let mut processes = self.processes.write().map_err(|e| e.to_string())?;
        processes.insert(
            name.to_string(),
            Arc::new(ServerHandle {
                process: Mutex::new(process),
            }),
        );
        Ok(status)
    }

    pub fn disconnect(&self, name: &str) -> Result<(), String> {
        let handle = {
            let mut processes = self.processes.write().map_err(|e| e.to_string())?;
            processes.remove(name)
        };
        if let Some(handle) = handle {
            let mut process = handle.process.lock().map_err(|e| e.to_string())?;
            process.shutdown();
            Ok(())
        } else {
            Err(format!("Server '{}' not found", name))
        }
    }

    pub fn list_tools(&self, name: &str) -> Result<Vec<MCPTool>, String> {
        self.with_process(name, |process| Ok(process.tools.clone()))
    }

    pub fn refresh_tools(&self, name: &str) -> Result<Vec<MCPTool>, String> {
        self.with_process(name, |process| process.refresh_tools())
    }

    pub fn call_tool(
        &self,
        name: &str,
        tool_name: &str,
        arguments: Value,
    ) -> Result<Value, String> {
        self.with_process(name, |process| process.call_tool(tool_name, arguments))
    }

    pub fn get_status(&self, name: &str) -> Result<MCPServerStatus, String> {
        self.with_process(name, |process| {
            Ok(MCPServerStatus {
                name: name.to_string(),
                status: "connected".to_string(),
                error: None,
                tools: process.tools.clone(),
            })
        })
    }

    pub fn list_servers(&self) -> Result<Vec<MCPServerStatus>, String> {
        let handles: Vec<(String, Arc<ServerHandle>)> = {
            let processes = self.processes.read().map_err(|e| e.to_string())?;
            processes
                .iter()
                .map(|(name, handle)| (name.clone(), Arc::clone(handle)))
                .collect()
        };

        let mut statuses = Vec::with_capacity(handles.len());
        for (name, handle) in handles {
            let process = handle.process.lock().map_err(|e| e.to_string())?;
            statuses.push(MCPServerStatus {
                name,
                status: "connected".to_string(),
                error: None,
                tools: process.tools.clone(),
            });
        }
        Ok(statuses)
    }

    pub fn cleanup(&self) {
        let handles = if let Ok(mut processes) = self.processes.write() {
            processes.drain().map(|(_, handle)| handle).collect::<Vec<_>>()
        } else {
            Vec::new()
        };

        for handle in handles {
            if let Ok(mut process) = handle.process.lock() {
                process.shutdown();
            }
        }
    }
}

impl Drop for MCPManager {
    fn drop(&mut self) {
        self.cleanup();
    }
}
