use std::{process::Command, sync::Arc};

use serde::Serialize;
use snotra_stt::{Dictation, DownloadProgress};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInputStatus {
    recording: bool,
    model_installed: bool,
    model_verified: bool,
    test_passed: bool,
    download_in_progress: bool,
    model_name: &'static str,
    model_bytes: u64,
    supported: bool,
    device_summary: String,
    compatibility_reason: Option<String>,
}

fn status(dictation: &Dictation) -> VoiceInputStatus {
    let state = dictation.status();
    let (supported, device_summary, compatibility_reason) = compatibility();
    VoiceInputStatus {
        recording: state.recording,
        model_installed: state.model_installed,
        model_verified: state.model_verified,
        test_passed: state.test_passed,
        download_in_progress: state.download_in_progress,
        model_name: state.model_name,
        model_bytes: state.model_bytes,
        supported,
        device_summary,
        compatibility_reason,
    }
}

#[cfg(target_os = "windows")]
fn compatibility() -> (bool, String, Option<String>) {
    let version = Command::new("cmd")
        .args(["/C", "ver"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_else(|| "Windows (unknown version)".to_owned());
    let build = version
        .split(|character: char| !character.is_ascii_digit() && character != '.')
        .find(|part| part.matches('.').count() >= 2)
        .and_then(|part| part.split('.').nth(2))
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let x64 = std::env::consts::ARCH == "x86_64";
    let supported = x64 && build >= 19_045;
    let reason = if !x64 {
        Some("Voice input currently requires a 64-bit x64 Windows PC.".to_owned())
    } else if build < 19_045 {
        Some("Voice input requires Windows 10 22H2 or Windows 11.".to_owned())
    } else {
        None
    };
    (
        supported,
        format!("{version} · {}", std::env::consts::ARCH),
        reason,
    )
}

#[cfg(target_os = "macos")]
fn compatibility() -> (bool, String, Option<String>) {
    let version = Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_else(|| "unknown version".to_owned());
    let major = version
        .split('.')
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let apple_silicon = std::env::consts::ARCH == "aarch64";
    let supported = apple_silicon && major >= 12;
    let reason = if !apple_silicon {
        Some("Voice input currently requires an Apple Silicon Mac (M1 or newer).".to_owned())
    } else if major < 12 {
        Some("Voice input requires macOS 12 or newer.".to_owned())
    } else {
        None
    };
    (
        supported,
        format!("macOS {version} · {}", std::env::consts::ARCH),
        reason,
    )
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn compatibility() -> (bool, String, Option<String>) {
    (
        false,
        format!("{} · {}", std::env::consts::OS, std::env::consts::ARCH),
        Some("Voice input is currently supported on Windows and macOS.".to_owned()),
    )
}

pub fn initialize(app: &tauri::App) -> Result<(), String> {
    let model_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data: {error}"))?
        .join("models");
    app.manage(Arc::new(Dictation::new(model_dir)));
    Ok(())
}

#[tauri::command]
pub fn get_dictation_status(state: tauri::State<Arc<Dictation>>) -> VoiceInputStatus {
    status(&state)
}

#[tauri::command]
pub async fn start_dictation(
    state: tauri::State<'_, Arc<Dictation>>,
) -> Result<VoiceInputStatus, String> {
    let (supported, _, reason) = compatibility();
    if !supported {
        return Err(
            reason.unwrap_or_else(|| "Voice input is not supported on this device.".to_owned())
        );
    }
    let dictation = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        dictation.start()?;
        Ok::<VoiceInputStatus, String>(status(&dictation))
    })
    .await
    .map_err(|error| format!("Dictation failed to start: {error}"))?
}

#[tauri::command]
pub async fn stop_dictation(state: tauri::State<'_, Arc<Dictation>>) -> Result<String, String> {
    let dictation = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || dictation.stop_and_transcribe())
        .await
        .map_err(|error| format!("Dictation stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn cancel_dictation(state: tauri::State<Arc<Dictation>>) {
    state.cancel();
}

#[tauri::command]
pub async fn download_dictation_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Dictation>>,
) -> Result<VoiceInputStatus, String> {
    let dictation = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        dictation.install_default_model_with_progress(|progress: DownloadProgress| {
            let _ = app.emit("dictation-download-progress", progress);
        })?;
        Ok::<VoiceInputStatus, String>(status(&dictation))
    })
    .await
    .map_err(|error| format!("Voice model download stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn cancel_dictation_model_download(state: tauri::State<Arc<Dictation>>) {
    state.cancel_model_download();
}

#[tauri::command]
pub async fn verify_dictation_model(
    state: tauri::State<'_, Arc<Dictation>>,
) -> Result<VoiceInputStatus, String> {
    let dictation = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        dictation.verify_default_model()?;
        Ok::<VoiceInputStatus, String>(status(&dictation))
    })
    .await
    .map_err(|error| format!("Voice model verification stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn mark_dictation_test_passed(
    state: tauri::State<Arc<Dictation>>,
) -> Result<VoiceInputStatus, String> {
    state.mark_test_passed()?;
    Ok(status(&state))
}

#[tauri::command]
pub fn delete_dictation_model(
    state: tauri::State<Arc<Dictation>>,
) -> Result<VoiceInputStatus, String> {
    state.delete_default_model()?;
    Ok(status(&state))
}

#[tauri::command]
pub fn dictation_level(state: tauri::State<Arc<Dictation>>) -> f32 {
    state.input_level()
}
