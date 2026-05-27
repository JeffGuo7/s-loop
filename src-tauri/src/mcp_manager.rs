use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

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

struct MCPServerProcess {
    child: Child,
    reader: BufReader<std::process::ChildStdout>,
    writer: std::process::ChildStdin,
    tools: Vec<MCPTool>,
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
        let reader = BufReader::new(stdout);
        let writer = stdin;

        let mut process = Self {
            child,
            reader,
            writer,
            tools: Vec::new(),
        };

        // Step 1: Initialize
        let result = process.send_request(
            1,
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "snotra", "version": "1.0.0" }
            }),
        )?;

        let server_info = result.get("serverInfo").and_then(|i| i.get("name")).and_then(|n| n.as_str()).unwrap_or("unknown");
        let protocol_version = result.get("protocolVersion").and_then(|v| v.as_str()).unwrap_or("unknown");
        eprintln!("[snotra:mcp] Server '{}' connected: name={}, protocol={}", name, server_info, protocol_version);

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
            let mut line = String::new();
            self.reader
                .read_line(&mut line)
                .map_err(|e| format!("Failed to read response from MCP server '{}': {}", method, e))?;

            if line.trim().is_empty() {
                continue;
            }

            let response: Result<Value, _> = serde_json::from_str(&line);
            let response = match response {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[snotra:mcp] JSON parse error: {} | line: {}", e, line.trim());
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
                    eprintln!("[snotra:mcp] Unexpected response ID for request {} on method {}", id, method);
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

pub struct MCPManager {
    processes: Mutex<HashMap<String, MCPServerProcess>>,
}

impl MCPManager {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub fn connect(
        &self,
        name: &str,
        command: &str,
        args: &[String],
    ) -> Result<MCPServerStatus, String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;

        if let Some(mut existing) = processes.remove(name) {
            existing.shutdown();
        }

        match MCPServerProcess::start(name, command, args) {
            Ok(process) => {
                let tools = process.tools.clone();
                let status = MCPServerStatus {
                    name: name.to_string(),
                    status: "connected".to_string(),
                    error: None,
                    tools: tools.clone(),
                };
                processes.insert(name.to_string(), process);
                Ok(status)
            }
            Err(e) => {
                Err(format!("Connection failed: {}", e))
            }
        }
    }

    pub fn disconnect(&self, name: &str) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(mut process) = processes.remove(name) {
            process.shutdown();
            Ok(())
        } else {
            Err(format!("Server '{}' not found", name))
        }
    }

    pub fn list_tools(&self, name: &str) -> Result<Vec<MCPTool>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        let process = processes
            .get(name)
            .ok_or_else(|| format!("Server '{}' not connected", name))?;
        Ok(process.tools.clone())
    }

    pub fn refresh_tools(&self, name: &str) -> Result<Vec<MCPTool>, String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        let process = processes
            .get_mut(name)
            .ok_or_else(|| format!("Server '{}' not connected", name))?;
        process.refresh_tools()
    }

    pub fn call_tool(
        &self,
        name: &str,
        tool_name: &str,
        arguments: Value,
    ) -> Result<Value, String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        let process = processes
            .get_mut(name)
            .ok_or_else(|| format!("Server '{}' not connected", name))?;
        process.call_tool(tool_name, arguments)
    }

    pub fn get_status(&self, name: &str) -> Result<MCPServerStatus, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        let process = processes
            .get(name)
            .ok_or_else(|| format!("Server '{}' not connected", name))?;
        Ok(MCPServerStatus {
            name: name.to_string(),
            status: "connected".to_string(),
            error: None,
            tools: process.tools.clone(),
        })
    }

    pub fn list_servers(&self) -> Result<Vec<MCPServerStatus>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .iter()
            .map(|(name, process)| MCPServerStatus {
                name: name.clone(),
                status: "connected".to_string(),
                error: None,
                tools: process.tools.clone(),
            })
            .collect())
    }

    pub fn cleanup(&self) {
        if let Ok(mut processes) = self.processes.lock() {
            for (_, mut process) in processes.drain() {
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
