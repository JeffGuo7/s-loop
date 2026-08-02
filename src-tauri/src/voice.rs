use std::sync::Arc;

use s_loop_speech::{
    PlaybackReference, RealtimeRecognizer, RealtimeVoiceEvent, SpeechPlaybackEvent,
    SpeechPlaybackState, SpeechSynthesizer, VoiceAssetKind, VoiceAssetProgress, VoiceAssetStatus,
    VoiceAssets,
};
use serde::Serialize;
use tauri::{Emitter, Manager};

pub struct VoiceRuntime {
    assets: Arc<VoiceAssets>,
    speech: Arc<SpeechSynthesizer>,
    realtime: Arc<RealtimeRecognizer>,
}

impl VoiceRuntime {
    fn new(model_dir: std::path::PathBuf) -> Self {
        let assets = Arc::new(VoiceAssets::new(model_dir));
        let playback_reference = Arc::new(PlaybackReference::new());
        Self {
            speech: Arc::new(SpeechSynthesizer::new(
                assets.clone(),
                playback_reference.clone(),
            )),
            realtime: Arc::new(RealtimeRecognizer::new(assets.clone(), playback_reference)),
            assets,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRuntimeStatus {
    assets: Vec<VoiceAssetStatus>,
    speaking: bool,
    listening: bool,
}

fn status(runtime: &VoiceRuntime) -> VoiceRuntimeStatus {
    VoiceRuntimeStatus {
        assets: runtime.assets.statuses(),
        speaking: runtime.speech.is_speaking(),
        listening: runtime.realtime.is_listening(),
    }
}

pub fn initialize(app: &tauri::App) -> Result<(), String> {
    let model_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data: {error}"))?
        .join("models");
    app.manage(Arc::new(VoiceRuntime::new(model_dir)));
    Ok(())
}

#[tauri::command]
pub fn get_voice_runtime_status(state: tauri::State<Arc<VoiceRuntime>>) -> VoiceRuntimeStatus {
    status(&state)
}

#[tauri::command]
pub async fn download_voice_asset(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<VoiceRuntime>>,
    kind: String,
    github_mirror: Option<String>,
) -> Result<VoiceRuntimeStatus, String> {
    let kind = VoiceAssetKind::parse(&kind)?;
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime.assets.install(
            kind,
            github_mirror.as_deref(),
            |progress: VoiceAssetProgress| {
                let _ = app.emit("voice-asset-progress", progress);
            },
        )?;
        Ok::<VoiceRuntimeStatus, String>(status(&runtime))
    })
    .await
    .map_err(|error| format!("Voice model installation stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn cancel_voice_asset_download(state: tauri::State<Arc<VoiceRuntime>>) {
    state.assets.cancel_download();
}

#[tauri::command]
pub async fn delete_voice_asset(
    state: tauri::State<'_, Arc<VoiceRuntime>>,
    kind: String,
) -> Result<VoiceRuntimeStatus, String> {
    let kind = VoiceAssetKind::parse(&kind)?;
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        match kind {
            VoiceAssetKind::Tts => runtime.speech.reset_model(),
            VoiceAssetKind::StreamingAsr | VoiceAssetKind::Vad => runtime.realtime.cancel(),
        }
        runtime.assets.delete(kind)?;
        Ok::<VoiceRuntimeStatus, String>(status(&runtime))
    })
    .await
    .map_err(|error| format!("Voice model deletion stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub fn speak_text(
    app: tauri::AppHandle,
    state: tauri::State<Arc<VoiceRuntime>>,
    text: String,
    speed: Option<f32>,
    speaker_id: Option<i32>,
) -> Result<u64, String> {
    let callback = Arc::new(move |event: SpeechPlaybackEvent| {
        let _ = app.emit("voice-playback", event);
    });
    state
        .speech
        .speak(text, speed.unwrap_or(1.0), speaker_id, callback)
}

#[tauri::command]
pub fn stop_speaking(app: tauri::AppHandle, state: tauri::State<Arc<VoiceRuntime>>) {
    let request_id = state.speech.stop();
    let _ = app.emit(
        "voice-playback",
        SpeechPlaybackEvent {
            request_id,
            state: SpeechPlaybackState::Idle,
            progress: 1.0,
            message: None,
        },
    );
}

#[tauri::command]
pub async fn start_realtime_voice(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<VoiceRuntime>>,
) -> Result<VoiceRuntimeStatus, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let callback = Arc::new(move |event: RealtimeVoiceEvent| {
            let _ = app.emit("voice-realtime", event);
        });
        runtime.realtime.start(callback)?;
        Ok::<VoiceRuntimeStatus, String>(status(&runtime))
    })
    .await
    .map_err(|error| format!("Real-time voice recognition failed to start: {error}"))?
}

#[tauri::command]
pub async fn stop_realtime_voice(
    state: tauri::State<'_, Arc<VoiceRuntime>>,
) -> Result<VoiceRuntimeStatus, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime.realtime.stop()?;
        Ok::<VoiceRuntimeStatus, String>(status(&runtime))
    })
    .await
    .map_err(|error| format!("Real-time voice recognition stopped unexpectedly: {error}"))?
}

#[tauri::command]
pub async fn cancel_realtime_voice(
    state: tauri::State<'_, Arc<VoiceRuntime>>,
) -> Result<VoiceRuntimeStatus, String> {
    let runtime = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        runtime.realtime.cancel();
        Ok::<VoiceRuntimeStatus, String>(status(&runtime))
    })
    .await
    .map_err(|error| format!("Real-time voice recognition stopped unexpectedly: {error}"))?
}
