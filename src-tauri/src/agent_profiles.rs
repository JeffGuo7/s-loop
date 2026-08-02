use serde::Deserialize;
use std::path::Path;
use tauri::Manager;

const MAX_PROFILE_FIELD_BYTES: usize = 256 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfileFiles {
    agent_id: String,
    identity: String,
    soul: String,
    rules: String,
    memory: String,
    user_profile: String,
    speaker_id: i32,
    conversation_mode: String,
}

fn validate_profile(profile: &AgentProfileFiles) -> Result<(), String> {
    if profile.agent_id.is_empty()
        || profile.agent_id.len() > 128
        || !profile
            .agent_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Agent ID may only contain letters, numbers, '-' and '_'.".to_owned());
    }
    if !(0..=52).contains(&profile.speaker_id) {
        return Err("Kokoro speaker ID must be between 0 and 52.".to_owned());
    }
    if !matches!(
        profile.conversation_mode.as_str(),
        "work" | "natural" | "companion"
    ) {
        return Err("Unknown conversation mode.".to_owned());
    }
    for (name, value) in [
        ("IDENTITY.md", &profile.identity),
        ("SOUL.md", &profile.soul),
        ("RULES.md", &profile.rules),
        ("MEMORY.md", &profile.memory),
        ("USER.md", &profile.user_profile),
    ] {
        if value.len() > MAX_PROFILE_FIELD_BYTES {
            return Err(format!("{name} exceeds the 256 KiB limit."));
        }
    }
    Ok(())
}

fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
    let normalized = if content.is_empty() {
        String::new()
    } else if content.ends_with('\n') {
        content.to_owned()
    } else {
        format!("{content}\n")
    };
    std::fs::write(path, normalized)
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn write_profile_files(root: &Path, profile: &AgentProfileFiles) -> Result<(), String> {
    validate_profile(profile)?;
    let agent_dir = root.join("agents").join(&profile.agent_id);
    let profiles_dir = root.join("profiles");
    std::fs::create_dir_all(&agent_dir)
        .map_err(|error| format!("Failed to create {}: {error}", agent_dir.display()))?;
    std::fs::create_dir_all(&profiles_dir)
        .map_err(|error| format!("Failed to create {}: {error}", profiles_dir.display()))?;

    write_text_file(&agent_dir.join("IDENTITY.md"), &profile.identity)?;
    write_text_file(&agent_dir.join("SOUL.md"), &profile.soul)?;
    write_text_file(&agent_dir.join("RULES.md"), &profile.rules)?;
    write_text_file(&agent_dir.join("MEMORY.md"), &profile.memory)?;
    write_text_file(&profiles_dir.join("USER.md"), &profile.user_profile)?;

    let voice = serde_json::json!({
        "speakerId": profile.speaker_id,
        "conversationMode": profile.conversation_mode,
    });
    let voice_json = serde_json::to_string_pretty(&voice)
        .map_err(|error| format!("Failed to encode VOICE.json: {error}"))?;
    write_text_file(&agent_dir.join("VOICE.json"), &voice_json)
}

#[tauri::command]
pub fn save_agent_profile_files(
    app: tauri::AppHandle,
    profile: AgentProfileFiles,
) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?
        .join("agent-profiles");
    write_profile_files(&root, &profile)
}

#[cfg(test)]
mod tests {
    use super::{validate_profile, AgentProfileFiles};

    fn profile(agent_id: &str, speaker_id: i32) -> AgentProfileFiles {
        AgentProfileFiles {
            agent_id: agent_id.to_owned(),
            identity: String::new(),
            soul: String::new(),
            rules: String::new(),
            memory: String::new(),
            user_profile: String::new(),
            speaker_id,
            conversation_mode: "natural".to_owned(),
        }
    }

    #[test]
    fn rejects_path_traversal_and_unknown_speakers() {
        assert!(validate_profile(&profile("../escape", 47)).is_err());
        assert!(validate_profile(&profile("valid_agent", 53)).is_err());
        assert!(validate_profile(&profile("valid-agent", 0)).is_ok());
    }
}
