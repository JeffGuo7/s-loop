use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// Search result from skills.sh API
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillsSearchResult {
    pub id: String,
    pub name: String,
    pub source: String,
    pub installs: i64,
}

/// Skills.sh API response wrapper
#[derive(Deserialize)]
struct SkillsSearchResponse {
    skills: Vec<SkillsSearchResult>,
}

/// Result of a skills CLI installation
#[derive(Serialize, Clone, Debug)]
pub struct SkillInstallResult {
    pub success: bool,
    pub message: String,
    pub skill_name: Option<String>,
    pub skill_path: Option<String>,
}

// ─── Mirror configuration ───

fn get_skills_api_url() -> String {
    std::env::var("S_LOOP_SKILLS_API_URL")
        .unwrap_or_else(|_| "https://skills.sh".to_string())
}

fn get_github_mirror_url() -> Option<String> {
    std::env::var("S_LOOP_GITHUB_MIRROR").ok()
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn percent_encode(query: &str) -> String {
    let mut result = String::new();
    for byte in query.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => result.push(byte as char),
            b' ' => result.push_str("%20"),
            _ => result.push_str(&format!("%{:02X}", byte)),
        }
    }
    result
}

// ─── ANSI escape code stripping ───

/// Strip ANSI escape sequences and cursor movement codes from CLI output.
/// Leaves plain text that can be displayed in a UI error message.
fn strip_ansi(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            // Skip escape sequences: ESC [ ... m (SGR), ESC [ ... J/K/h/l (cursor), etc.
            if chars.peek() == Some(&'[') {
                chars.next(); // skip '['
                // Consume parameter bytes (digits, semicolons)
                while let Some(&c) = chars.peek() {
                    if c.is_ascii_digit() || c == ';' || c == '?' {
                        chars.next();
                    } else {
                        break;
                    }
                }
                // Consume final byte (letter: m, J, K, h, l, A, B, C, D, etc.)
                chars.next();
            }
            // Also skip ESC ] (OSC sequences)
            else if chars.peek() == Some(&']') {
                chars.next(); // skip ']'
                while let Some(&c) = chars.peek() {
                    if c == '\x07' || c == '\x1b' {
                        break;
                    }
                    chars.next();
                }
                if chars.peek() == Some(&'\x07') {
                    chars.next();
                }
            }
        }
        // Skip cursor movement codes: \r, and the 999D pattern (move cursor back 999 columns)
        else if ch == '\r' {
            // Skip carriage return — often followed by cursor-back sequences
            continue;
        }
        // Skip the "move cursor back N columns" escape (999D without ESC prefix caused by double-strip)
        else if ch == '[' && result.ends_with('\n') {
            // This is likely a residual CSI without ESC — skip until letter
            continue;
        }
        else {
            result.push(ch);
        }
    }

    result
}

/// Extract the meaningful error lines from CLI stderr/stdout, stripping ANSI and spinners
fn clean_cli_output(raw: &str) -> String {
    let stripped = strip_ansi(raw);
    let lines: Vec<&str> = stripped
        .lines()
        .map(|l| l.trim())
        .filter(|l| {
            !l.is_empty()
                && !l.starts_with('|')
                && !l.starts_with("◇")
                && !l.starts_with("●")
                && !l.starts_with("○")
                && !l.starts_with("■")
                && !l.starts_with("▲")
                && !l.starts_with("◒")
                && !l.starts_with("◐")
                && !l.starts_with("◓")
                && !l.starts_with("◑")
                && !l.starts_with("—")
                && !l.starts_with("└")
                && !l.starts_with("├")
                && !l.starts_with("│")
        })
        .collect();

    if lines.is_empty() {
        return stripped.chars().take(500).collect();
    }

    lines.join("\n").chars().take(800).collect()
}

// ─── npx resolution (cross-platform — GUI apps may not inherit user PATH) ───

/// Find the npx executable by searching common installation paths.
/// GUI apps on all platforms may not inherit shell-configured PATH.
fn find_npx_cmd() -> Option<PathBuf> {
    let npx_name = if cfg!(target_os = "windows") {
        "npx.cmd"
    } else {
        "npx"
    };

    // 1. Try the system's command locator
    let locator = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = Command::new(locator).arg(npx_name).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().next() {
            let p = line.trim();
            if !p.is_empty() && std::path::Path::new(p).exists() {
                return Some(PathBuf::from(p));
            }
        }
    }

    // 2. Search common Node.js install directories (cross-platform)
    let home = dirs_home();
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            r"C:\Program Files\nodejs\npx.cmd".into(),
            r"C:\Program Files (x86)\nodejs\npx.cmd".into(),
            home.join("AppData").join("Roaming").join("npm").join("npx.cmd"),
        ]
    } else {
        vec![
            // Homebrew (Intel Mac)
            "/usr/local/bin/npx".into(),
            // Homebrew (Apple Silicon Mac)
            "/opt/homebrew/bin/npx".into(),
            // System
            "/usr/bin/npx".into(),
            // Volta (cross-platform version manager)
            home.join(".volta").join("bin").join("npx"),
            // fnm (cross-platform version manager)
            home.join(".local").join("share").join("fnm").join("node-versions"),
        ]
    };

    for candidate in &candidates {
        if candidate.exists() {
            return Some(candidate.clone());
        }
    }

    // 3. Search for node and derive npx path
    if let Ok(output) = Command::new(locator).arg(if cfg!(target_os = "windows") { "node.exe" } else { "node" }).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let node_path = PathBuf::from(line.trim());
            if let Some(parent) = node_path.parent() {
                let npx = parent.join(npx_name);
                if npx.exists() {
                    return Some(npx);
                }
            }
        }
    }

    // 4. nvm: search ~/.nvm/versions/node/*/bin/npx
    let nvm_versions = home.join(".nvm").join("versions").join("node");
    if nvm_versions.exists() {
        if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
            for entry in entries.flatten() {
                let npx = entry.path().join("bin").join("npx");
                if npx.exists() {
                    return Some(npx);
                }
            }
        }
    }

    None
}

/// Build a Command for npx, using resolved path when available
fn npx_command() -> Command {
    if let Some(npx_path) = find_npx_cmd() {
        Command::new(npx_path)
    } else {
        Command::new("npx")
    }
}

// ─── Skills CLI commands ───

/// Search skills via skills.sh API (supports mirror)
#[tauri::command]
pub async fn skills_cli_search(query: String) -> Result<Vec<SkillsSearchResult>, String> {
    let api_base = get_skills_api_url();
    let encoded = percent_encode(&query);
    let url = format!("{}/api/search?q={}&limit=20", api_base, encoded);

    let client = reqwest::Client::builder()
        .user_agent("S-Loop/0.1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let res = client.get(&url).send().await.map_err(|e| format!("Search request failed: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Search API returned status {}", res.status()));
    }

    let data = res
        .json::<SkillsSearchResponse>()
        .await
        .map_err(|e| format!("Failed to parse search response: {e}"))?;

    let mut skills = data.skills;
    skills.sort_by(|a, b| b.installs.cmp(&a.installs));
    Ok(skills)
}

/// Build the source argument for skills CLI, applying mirror if configured
fn build_source_arg(source: &str) -> String {
    if let Some(mirror) = get_github_mirror_url() {
        let mirror = mirror.trim_end_matches('/');
        if source.contains('/') && !source.starts_with("http") && !source.starts_with("git@") {
            format!("{}/{}", mirror, source)
        } else {
            source.to_string()
        }
    } else {
        source.to_string()
    }
}

/// Install a skill via npx skills CLI
#[tauri::command]
pub async fn skills_cli_install(
    source: String,
    skill_name: Option<String>,
) -> Result<SkillInstallResult, String> {
    let effective_source = build_source_arg(&source);

    let mut args = vec![
        "skills".to_string(),
        "add".to_string(),
        effective_source.clone(),
        "--agent".to_string(),
        "pi".to_string(),
        "-g".to_string(),
        "-y".to_string(),
    ];

    if let Some(ref name) = skill_name {
        args.push("--skill".to_string());
        args.push(name.clone());
    }

    // Run npx with a 120s timeout
    let api_url = get_skills_api_url();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let result = npx_command()
            .args(&args)
            .env("SKILLS_API_URL", &api_url)
            .output();
        let _ = tx.send(result);
    });

    let output = rx
        .recv_timeout(Duration::from_secs(120))
        .map_err(|_| "npx skills timed out after 120s. Check network or try again.".to_string())?
        .map_err(|e| format!("Failed to run npx skills: {e}. Is Node.js installed?"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let cleaned = clean_cli_output(&format!("{}\n{}", stderr, stdout));
        return Ok(SkillInstallResult {
            success: false,
            message: cleaned,
            skill_name: None,
            skill_path: None,
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    let extracted_name = skill_name.clone().or_else(|| {
        for line in stdout.lines() {
            let lower = line.to_lowercase();
            if lower.contains("successfully") || lower.contains("installed") || lower.contains("added") || lower.contains("symlinked") {
                if let Some(name) = extract_skill_name_from_line(line) {
                    return Some(name);
                }
            }
        }
        None
    });

    let home = dirs_home();
    let skill_path = extracted_name.as_ref().map(|n| {
        home.join(".pi").join("agent").join("skills").join(n)
            .to_string_lossy()
            .to_string()
    });

    Ok(SkillInstallResult {
        success: true,
        message: clean_cli_output(&stdout),
        skill_name: extracted_name,
        skill_path,
    })
}

/// List installed skills via npx skills CLI
#[allow(dead_code)]
#[tauri::command]
pub async fn skills_cli_list(global: Option<bool>) -> Result<String, String> {
    let mut args = vec!["skills".to_string(), "list".to_string()];
    if global.unwrap_or(true) {
        args.push("-g".to_string());
    }

    let output = npx_command()
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run npx skills list: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("List failed:\n{}\n{}", stdout, stderr));
    }

    Ok(format!("{}\n{}", stdout, stderr))
}

/// Update installed skills via npx skills CLI
#[tauri::command]
pub async fn skills_cli_update() -> Result<String, String> {
    let api_url = get_skills_api_url();

    let output = npx_command()
        .args(["skills", "update", "-y"])
        .env("SKILLS_API_URL", &api_url)
        .output()
        .map_err(|e| format!("Failed to run npx skills update: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Update failed:\n{}\n{}", stdout, stderr));
    }

    Ok(stdout)
}

/// Remove a skill via npx skills CLI
#[tauri::command]
pub async fn skills_cli_remove(skill_name: String) -> Result<String, String> {
    let output = npx_command()
        .args([
            "skills",
            "remove",
            &skill_name,
            "--agent",
            "pi",
            "-g",
            "-y",
        ])
        .output()
        .map_err(|e| format!("Failed to run npx skills remove: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Remove failed:\n{}\n{}", stdout, stderr));
    }

    Ok(stdout)
}

/// Check current mirror configuration
#[tauri::command]
pub fn skills_mirror_config() -> serde_json::Value {
    serde_json::json!({
        "api_url": get_skills_api_url(),
        "github_mirror": get_github_mirror_url(),
    })
}

// ─── Helpers ───

fn extract_skill_name_from_line(line: &str) -> Option<String> {
    let lower = line.to_lowercase();
    for prefix in &["installed ", "added ", "copied ", "symlinked "] {
        if let Some(pos) = lower.find(prefix) {
            let after = &line[pos + prefix.len()..];
            let name = after
                .split_whitespace()
                .next()
                .unwrap_or("")
                .trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_');
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}
