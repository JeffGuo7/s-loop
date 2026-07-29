use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
};

use rodio::{buffer::SamplesBuffer, OutputStream, Sink};
use serde::Serialize;
use sherpa_onnx::{
    GenerationConfig, OfflineTts, OfflineTtsConfig, OfflineTtsKokoroModelConfig,
    OfflineTtsModelConfig,
};

use crate::voice_assets::{VoiceAssetKind, VoiceAssets};

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SpeechPlaybackState {
    Loading,
    Speaking,
    Idle,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechPlaybackEvent {
    pub request_id: u64,
    pub state: SpeechPlaybackState,
    pub progress: f32,
    pub message: Option<String>,
}

pub struct SpeechSynthesizer {
    assets: Arc<VoiceAssets>,
    engine: Mutex<Option<Arc<OfflineTts>>>,
    generation: AtomicU64,
    current_request: Arc<AtomicU64>,
    speaking: AtomicBool,
    sink: Mutex<Option<Arc<Sink>>>,
}

impl SpeechSynthesizer {
    pub fn new(assets: Arc<VoiceAssets>) -> Self {
        Self {
            assets,
            engine: Mutex::new(None),
            generation: AtomicU64::new(0),
            current_request: Arc::new(AtomicU64::new(0)),
            speaking: AtomicBool::new(false),
            sink: Mutex::new(None),
        }
    }

    pub fn is_speaking(&self) -> bool {
        self.speaking.load(Ordering::SeqCst)
    }

    pub fn speak(
        self: &Arc<Self>,
        text: String,
        speed: f32,
        on_event: Arc<dyn Fn(SpeechPlaybackEvent) + Send + Sync>,
    ) -> Result<u64, String> {
        let text = text.trim().to_owned();
        if text.is_empty() {
            return Err("There is no text to speak.".to_owned());
        }
        if !self.assets.is_installed(VoiceAssetKind::Tts) {
            return Err("Install the local text-to-speech model in Settings first.".to_owned());
        }

        self.stop();
        let request_id = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.current_request.store(request_id, Ordering::SeqCst);
        self.speaking.store(true, Ordering::SeqCst);
        on_event(SpeechPlaybackEvent {
            request_id,
            state: SpeechPlaybackState::Loading,
            progress: 0.0,
            message: None,
        });

        let synthesizer = self.clone();
        thread::spawn(move || {
            if let Err(error) = synthesizer.run_speech(request_id, &text, speed, on_event.clone()) {
                if synthesizer.current_request.load(Ordering::SeqCst) == request_id {
                    let _ = synthesizer.stop();
                    on_event(SpeechPlaybackEvent {
                        request_id,
                        state: SpeechPlaybackState::Error,
                        progress: 0.0,
                        message: Some(error),
                    });
                }
            }
        });
        Ok(request_id)
    }

    fn run_speech(
        &self,
        request_id: u64,
        text: &str,
        speed: f32,
        on_event: Arc<dyn Fn(SpeechPlaybackEvent) + Send + Sync>,
    ) -> Result<(), String> {
        let engine = self.load_engine()?;
        if self.current_request.load(Ordering::SeqCst) != request_id {
            return Ok(());
        }

        let (_output_stream, output_handle) = OutputStream::try_default()
            .map_err(|error| format!("Could not open the default speaker: {error}"))?;
        let sink = Arc::new(
            Sink::try_new(&output_handle)
                .map_err(|error| format!("Could not create an audio playback stream: {error}"))?,
        );
        if let Ok(mut active) = self.sink.lock() {
            *active = Some(sink.clone());
        }

        let sample_rate = engine.sample_rate() as u32;
        let callback_request = self.current_request.clone();
        let callback_sink = sink.clone();
        let callback_event = on_event.clone();
        let received_audio = Arc::new(AtomicBool::new(false));
        let callback_received_audio = received_audio.clone();
        let mut last_progress = -1.0_f32;

        on_event(SpeechPlaybackEvent {
            request_id,
            state: SpeechPlaybackState::Speaking,
            progress: 0.0,
            message: None,
        });

        let config = GenerationConfig {
            sid: 0,
            speed: speed.clamp(0.7, 1.4),
            ..Default::default()
        };
        let generated = engine.generate_with_config(
            text,
            &config,
            Some(move |samples: &[f32], progress: f32| {
                if callback_request.load(Ordering::SeqCst) != request_id {
                    return false;
                }
                if !samples.is_empty() {
                    callback_received_audio.store(true, Ordering::SeqCst);
                    callback_sink.append(SamplesBuffer::new(1, sample_rate, samples.to_vec()));
                }
                if progress >= 1.0 || progress - last_progress >= 0.05 {
                    last_progress = progress;
                    callback_event(SpeechPlaybackEvent {
                        request_id,
                        state: SpeechPlaybackState::Speaking,
                        progress,
                        message: None,
                    });
                }
                true
            }),
        );

        if self.current_request.load(Ordering::SeqCst) != request_id {
            sink.stop();
            return Ok(());
        }
        let audio = generated.ok_or_else(|| "Text-to-speech generation failed.".to_owned())?;
        if !received_audio.load(Ordering::SeqCst) && !audio.samples().is_empty() {
            sink.append(SamplesBuffer::new(
                1,
                audio.sample_rate() as u32,
                audio.samples().to_vec(),
            ));
        }
        sink.sleep_until_end();

        if self.current_request.load(Ordering::SeqCst) == request_id {
            self.speaking.store(false, Ordering::SeqCst);
            if let Ok(mut active) = self.sink.lock() {
                *active = None;
            }
            on_event(SpeechPlaybackEvent {
                request_id,
                state: SpeechPlaybackState::Idle,
                progress: 1.0,
                message: None,
            });
        }
        Ok(())
    }

    fn load_engine(&self) -> Result<Arc<OfflineTts>, String> {
        let mut cached = self
            .engine
            .lock()
            .map_err(|_| "The text-to-speech engine is unavailable.".to_owned())?;
        if let Some(engine) = cached.as_ref() {
            return Ok(engine.clone());
        }

        let root = self.assets.asset_path(VoiceAssetKind::Tts);
        let path = |name: &str| root.join(name).to_string_lossy().into_owned();
        let config = OfflineTtsConfig {
            model: OfflineTtsModelConfig {
                kokoro: OfflineTtsKokoroModelConfig {
                    model: Some(path("model.onnx")),
                    voices: Some(path("voices.bin")),
                    tokens: Some(path("tokens.txt")),
                    data_dir: Some(path("espeak-ng-data")),
                    dict_dir: Some(path("dict")),
                    lexicon: Some(format!(
                        "{},{}",
                        path("lexicon-us-en.txt"),
                        path("lexicon-zh.txt")
                    )),
                    length_scale: 1.0,
                    ..Default::default()
                },
                num_threads: 2,
                provider: Some("cpu".to_owned()),
                ..Default::default()
            },
            ..Default::default()
        };
        let engine =
            Arc::new(OfflineTts::create(&config).ok_or_else(|| {
                "Could not initialize the local text-to-speech model.".to_owned()
            })?);
        *cached = Some(engine.clone());
        Ok(engine)
    }

    pub fn stop(&self) -> u64 {
        let request_id = self.current_request.swap(0, Ordering::SeqCst);
        self.speaking.store(false, Ordering::SeqCst);
        if let Ok(mut active) = self.sink.lock() {
            if let Some(sink) = active.take() {
                sink.stop();
            }
        }
        request_id
    }

    pub fn reset_model(&self) {
        let _ = self.stop();
        if let Ok(mut engine) = self.engine.lock() {
            *engine = None;
        }
    }
}
