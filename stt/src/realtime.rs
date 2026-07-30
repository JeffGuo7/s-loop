use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream, StreamConfig,
};
use serde::Serialize;
use sherpa_onnx::{
    LinearResampler, OnlineRecognizer, OnlineRecognizerConfig, SileroVadModelConfig,
    VadModelConfig, VoiceActivityDetector,
};
use sonora::{
    config::{
        AdaptiveDigital, EchoCanceller, GainController2, HighPassFilter, NoiseSuppression,
        NoiseSuppressionLevel,
    },
    AudioProcessing, Config as AudioProcessingConfig, StreamConfig as AudioStreamConfig,
};

use crate::{
    playback::{PlaybackFrame, PlaybackReference},
    voice_assets::{VoiceAssetKind, VoiceAssets},
};

const TARGET_SAMPLE_RATE: i32 = 16_000;
const AUDIO_PROCESSING_FRAME_SIZE: usize = TARGET_SAMPLE_RATE as usize / 100;
const VAD_WINDOW_SIZE: usize = 512;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RealtimeEventKind {
    State,
    Level,
    Partial,
    Final,
    SpeechStart,
    SpeechEnd,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RealtimeState {
    Starting,
    Listening,
    Stopped,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeVoiceEvent {
    pub kind: RealtimeEventKind,
    pub state: Option<RealtimeState>,
    pub text: Option<String>,
    pub level: Option<f32>,
    pub turn_complete: bool,
    pub message: Option<String>,
}

impl RealtimeVoiceEvent {
    fn state(state: RealtimeState) -> Self {
        Self {
            kind: RealtimeEventKind::State,
            state: Some(state),
            text: None,
            level: None,
            turn_complete: false,
            message: None,
        }
    }

    fn text(kind: RealtimeEventKind, text: String, turn_complete: bool) -> Self {
        Self {
            kind,
            state: None,
            text: Some(text),
            level: None,
            turn_complete,
            message: None,
        }
    }

    fn level(level: f32) -> Self {
        Self {
            kind: RealtimeEventKind::Level,
            state: None,
            text: None,
            level: Some(level),
            turn_complete: false,
            message: None,
        }
    }

    fn marker(kind: RealtimeEventKind) -> Self {
        Self {
            kind,
            state: None,
            text: None,
            level: None,
            turn_complete: false,
            message: None,
        }
    }

    fn error(message: String) -> Self {
        Self {
            kind: RealtimeEventKind::Error,
            state: None,
            text: None,
            level: None,
            turn_complete: false,
            message: Some(message),
        }
    }
}

struct ActiveSession {
    stop_mode: Arc<AtomicU8>,
    handle: JoinHandle<()>,
}

pub struct RealtimeRecognizer {
    assets: Arc<VoiceAssets>,
    playback_reference: Arc<PlaybackReference>,
    active: Mutex<Option<ActiveSession>>,
    listening: Arc<AtomicBool>,
}

impl RealtimeRecognizer {
    pub fn new(assets: Arc<VoiceAssets>, playback_reference: Arc<PlaybackReference>) -> Self {
        Self {
            assets,
            playback_reference,
            active: Mutex::new(None),
            listening: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_listening(&self) -> bool {
        self.listening.load(Ordering::SeqCst)
    }

    pub fn start(
        &self,
        on_event: Arc<dyn Fn(RealtimeVoiceEvent) + Send + Sync>,
    ) -> Result<(), String> {
        if !self.assets.is_installed(VoiceAssetKind::StreamingAsr) {
            return Err(
                "Install the streaming speech recognition model in Settings first.".to_owned(),
            );
        }
        if !self.assets.is_installed(VoiceAssetKind::Vad) {
            return Err("Install the voice activity detector in Settings first.".to_owned());
        }
        if self.is_listening() {
            return Err("Real-time voice recognition is already running.".to_owned());
        }

        let mut active = self
            .active
            .lock()
            .map_err(|_| "Real-time voice state is unavailable.".to_owned())?;
        if active.is_some() {
            return Err("Real-time voice recognition is stopping. Try again shortly.".to_owned());
        }

        on_event(RealtimeVoiceEvent::state(RealtimeState::Starting));
        let asr_path = self.assets.asset_path(VoiceAssetKind::StreamingAsr);
        let vad_path = self.assets.asset_path(VoiceAssetKind::Vad);
        let stop_mode = Arc::new(AtomicU8::new(0));
        let worker_stop = stop_mode.clone();
        let listening = self.listening.clone();
        let playback_rx = self.playback_reference.subscribe();
        let (ready_tx, ready_rx) = mpsc::channel();
        let worker_event = on_event.clone();
        let handle = thread::spawn(move || {
            let result = run_realtime_worker(
                &asr_path,
                &vad_path,
                worker_stop,
                listening.clone(),
                worker_event.clone(),
                ready_tx,
                playback_rx,
            );
            listening.store(false, Ordering::SeqCst);
            if let Err(error) = result {
                worker_event(RealtimeVoiceEvent::error(error));
            }
            worker_event(RealtimeVoiceEvent::state(RealtimeState::Stopped));
        });

        match ready_rx.recv_timeout(Duration::from_secs(45)) {
            Ok(Ok(())) => {
                *active = Some(ActiveSession { stop_mode, handle });
                Ok(())
            }
            Ok(Err(error)) => {
                let _ = handle.join();
                Err(error)
            }
            Err(_) => {
                stop_mode.store(2, Ordering::SeqCst);
                let _ = handle.join();
                Err("Timed out while loading the real-time speech models.".to_owned())
            }
        }
    }

    pub fn stop(&self) -> Result<(), String> {
        self.finish_session(1)
    }

    pub fn cancel(&self) {
        let _ = self.finish_session(2);
    }

    fn finish_session(&self, mode: u8) -> Result<(), String> {
        let session = self
            .active
            .lock()
            .map_err(|_| "Real-time voice state is unavailable.".to_owned())?
            .take();
        if let Some(session) = session {
            session.stop_mode.store(mode, Ordering::SeqCst);
            session
                .handle
                .join()
                .map_err(|_| "Real-time voice recognition stopped unexpectedly.".to_owned())?;
        }
        self.listening.store(false, Ordering::SeqCst);
        Ok(())
    }
}

fn run_realtime_worker(
    asr_path: &std::path::Path,
    vad_path: &std::path::Path,
    stop_mode: Arc<AtomicU8>,
    listening: Arc<AtomicBool>,
    on_event: Arc<dyn Fn(RealtimeVoiceEvent) + Send + Sync>,
    ready: mpsc::Sender<Result<(), String>>,
    playback_rx: mpsc::Receiver<PlaybackFrame>,
) -> Result<(), String> {
    let recognizer = match create_recognizer(asr_path) {
        Ok(recognizer) => recognizer,
        Err(error) => {
            let _ = ready.send(Err(error.clone()));
            return Err(error);
        }
    };
    let vad = match create_vad(vad_path) {
        Ok(vad) => vad,
        Err(error) => {
            let _ = ready.send(Err(error.clone()));
            return Err(error);
        }
    };
    let (audio_stream, audio_rx, source_sample_rate) = match create_audio_input() {
        Ok(audio) => audio,
        Err(error) => {
            let _ = ready.send(Err(error.clone()));
            return Err(error);
        }
    };
    let resampler = LinearResampler::create(source_sample_rate as i32, TARGET_SAMPLE_RATE)
        .ok_or_else(|| "Could not create the microphone resampler.".to_owned())?;
    let mut audio_processor = create_audio_processor();
    let recognition_stream = recognizer.create_stream();
    audio_stream
        .play()
        .map_err(|error| format!("Could not start microphone recording: {error}"))?;

    listening.store(true, Ordering::SeqCst);
    on_event(RealtimeVoiceEvent::state(RealtimeState::Listening));
    let _ = ready.send(Ok(()));

    let mut vad_buffer = Vec::<f32>::new();
    let mut capture_buffer = VecDeque::<f32>::new();
    let mut render_buffer = VecDeque::<f32>::new();
    let mut render_resampler: Option<(u32, Option<LinearResampler>)> = None;
    let mut partial = String::new();
    let mut vad_detected = false;
    let mut last_level_at = Instant::now() - Duration::from_secs(1);

    while stop_mode.load(Ordering::SeqCst) == 0 {
        let samples = match audio_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(samples) => samples,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        if samples.is_empty() {
            continue;
        }

        let samples = resampler.resample(&samples, false);
        if samples.is_empty() {
            continue;
        }
        capture_buffer.extend(samples);

        while capture_buffer.len() >= AUDIO_PROCESSING_FRAME_SIZE {
            drain_playback_reference(&playback_rx, &mut render_resampler, &mut render_buffer)?;
            let render_frame =
                take_audio_frame(&mut render_buffer).unwrap_or_else(silent_audio_frame);
            let capture_frame =
                take_audio_frame(&mut capture_buffer).expect("capture frame length was checked");
            let mut render_output = vec![0.0_f32; AUDIO_PROCESSING_FRAME_SIZE];
            audio_processor
                .process_render_f32(&[&render_frame], &mut [&mut render_output])
                .map_err(|error| format!("Could not process speaker reference audio: {error}"))?;
            let mut cleaned = vec![0.0_f32; AUDIO_PROCESSING_FRAME_SIZE];
            audio_processor
                .process_capture_f32(&[&capture_frame], &mut [&mut cleaned])
                .map_err(|error| format!("Could not process microphone audio: {error}"))?;

            if last_level_at.elapsed() >= Duration::from_millis(80) {
                on_event(RealtimeVoiceEvent::level(input_level(&cleaned)));
                last_level_at = Instant::now();
            }

            recognition_stream.accept_waveform(TARGET_SAMPLE_RATE, &cleaned);
            vad_buffer.extend_from_slice(&cleaned);
            while vad_buffer.len() >= VAD_WINDOW_SIZE {
                let tail = vad_buffer.split_off(VAD_WINDOW_SIZE);
                vad.accept_waveform(&vad_buffer);
                vad_buffer = tail;
                while vad.front().is_some() {
                    vad.pop();
                }
            }

            let now_detected = vad.detected();
            if now_detected != vad_detected {
                vad_detected = now_detected;
                on_event(RealtimeVoiceEvent::marker(if now_detected {
                    RealtimeEventKind::SpeechStart
                } else {
                    RealtimeEventKind::SpeechEnd
                }));
            }
        }

        decode_available(
            &recognizer,
            &recognition_stream,
            &mut partial,
            on_event.as_ref(),
        );
    }

    drop(audio_stream);
    if stop_mode.load(Ordering::SeqCst) == 1 {
        let tail = resampler.resample(&[], true);
        if !tail.is_empty() {
            recognition_stream.accept_waveform(TARGET_SAMPLE_RATE, &tail);
        }
        recognition_stream.input_finished();
        decode_available(
            &recognizer,
            &recognition_stream,
            &mut partial,
            on_event.as_ref(),
        );
        if let Some(result) = recognizer.get_result(&recognition_stream) {
            let text = result.text.trim().to_owned();
            if !text.is_empty() && text != partial {
                on_event(RealtimeVoiceEvent::text(
                    RealtimeEventKind::Final,
                    text,
                    true,
                ));
            } else if !partial.trim().is_empty() {
                on_event(RealtimeVoiceEvent::text(
                    RealtimeEventKind::Final,
                    partial.trim().to_owned(),
                    true,
                ));
            }
        }
    }
    Ok(())
}

fn create_audio_processor() -> AudioProcessing {
    let stream_config = AudioStreamConfig::new(TARGET_SAMPLE_RATE as u32, 1);
    let config = AudioProcessingConfig {
        high_pass_filter: Some(HighPassFilter::default()),
        echo_canceller: Some(EchoCanceller::default()),
        noise_suppression: Some(NoiseSuppression {
            level: NoiseSuppressionLevel::High,
            ..Default::default()
        }),
        gain_controller2: Some(GainController2 {
            adaptive_digital: Some(AdaptiveDigital::default()),
            ..Default::default()
        }),
        ..Default::default()
    };
    AudioProcessing::builder()
        .config(config)
        .capture_config(stream_config)
        .render_config(stream_config)
        .build()
}

fn drain_playback_reference(
    receiver: &mpsc::Receiver<PlaybackFrame>,
    resampler: &mut Option<(u32, Option<LinearResampler>)>,
    output: &mut VecDeque<f32>,
) -> Result<(), String> {
    loop {
        let frame = match receiver.try_recv() {
            Ok(frame) => frame,
            Err(mpsc::TryRecvError::Empty | mpsc::TryRecvError::Disconnected) => break,
        };
        if resampler.as_ref().map(|current| current.0) != Some(frame.sample_rate) {
            let next = if frame.sample_rate == TARGET_SAMPLE_RATE as u32 {
                None
            } else {
                Some(
                    LinearResampler::create(frame.sample_rate as i32, TARGET_SAMPLE_RATE)
                        .ok_or_else(|| {
                            "Could not create the speaker reference resampler.".to_owned()
                        })?,
                )
            };
            *resampler = Some((frame.sample_rate, next));
        }
        let samples = match resampler.as_ref().and_then(|current| current.1.as_ref()) {
            Some(resampler) => resampler.resample(&frame.samples, false),
            None => frame.samples,
        };
        output.extend(samples);
    }

    // If recognition falls behind, stale render audio is worse than dropping it:
    // AEC3 can estimate a short delay but should not receive seconds-old playback.
    let maximum_buffer = TARGET_SAMPLE_RATE as usize;
    if output.len() > maximum_buffer {
        output.drain(..output.len() - maximum_buffer);
    }
    Ok(())
}

fn take_audio_frame(buffer: &mut VecDeque<f32>) -> Option<Vec<f32>> {
    if buffer.len() < AUDIO_PROCESSING_FRAME_SIZE {
        return None;
    }
    Some(
        buffer
            .drain(..AUDIO_PROCESSING_FRAME_SIZE)
            .collect::<Vec<_>>(),
    )
}

fn silent_audio_frame() -> Vec<f32> {
    vec![0.0; AUDIO_PROCESSING_FRAME_SIZE]
}

#[cfg(test)]
mod audio_processing_tests {
    use super::{create_audio_processor, silent_audio_frame, AUDIO_PROCESSING_FRAME_SIZE};

    #[test]
    fn full_duplex_processor_accepts_ten_millisecond_frames() {
        let mut processor = create_audio_processor();
        let render = vec![0.1_f32; AUDIO_PROCESSING_FRAME_SIZE];
        let capture = vec![0.15_f32; AUDIO_PROCESSING_FRAME_SIZE];
        let mut render_output = silent_audio_frame();
        let mut capture_output = silent_audio_frame();

        processor
            .process_render_f32(&[&render], &mut [&mut render_output])
            .unwrap();
        processor
            .process_capture_f32(&[&capture], &mut [&mut capture_output])
            .unwrap();

        assert!(capture_output.iter().all(|sample| sample.is_finite()));
    }
}

fn decode_available(
    recognizer: &OnlineRecognizer,
    stream: &sherpa_onnx::OnlineStream,
    partial: &mut String,
    on_event: &(dyn Fn(RealtimeVoiceEvent) + Send + Sync),
) {
    while recognizer.is_ready(stream) {
        recognizer.decode(stream);
        if let Some(result) = recognizer.get_result(stream) {
            let text = result.text.trim().to_owned();
            if !text.is_empty() && text != *partial {
                *partial = text.clone();
                on_event(RealtimeVoiceEvent::text(
                    RealtimeEventKind::Partial,
                    text,
                    false,
                ));
            }
        }
        if recognizer.is_endpoint(stream) {
            if let Some(result) = recognizer.get_result(stream) {
                let text = result.text.trim().to_owned();
                if !text.is_empty() {
                    on_event(RealtimeVoiceEvent::text(
                        RealtimeEventKind::Final,
                        text,
                        true,
                    ));
                }
            }
            recognizer.reset(stream);
            partial.clear();
        }
    }
}

fn create_recognizer(model_root: &std::path::Path) -> Result<OnlineRecognizer, String> {
    let path = |name: &str| model_root.join(name).to_string_lossy().into_owned();
    let mut config = OnlineRecognizerConfig::default();
    config.model_config.transducer.encoder = Some(path("encoder-epoch-99-avg-1.int8.onnx"));
    config.model_config.transducer.decoder = Some(path("decoder-epoch-99-avg-1.onnx"));
    config.model_config.transducer.joiner = Some(path("joiner-epoch-99-avg-1.int8.onnx"));
    config.model_config.tokens = Some(path("tokens.txt"));
    config.model_config.provider = Some("cpu".to_owned());
    config.model_config.num_threads = 2;
    config.decoding_method = Some("greedy_search".to_owned());
    config.enable_endpoint = true;
    config.rule1_min_trailing_silence = 1.2;
    config.rule2_min_trailing_silence = 0.8;
    config.rule3_min_utterance_length = 20.0;
    OnlineRecognizer::create(&config)
        .ok_or_else(|| "Could not initialize the streaming speech recognition model.".to_owned())
}

fn create_vad(model_path: &std::path::Path) -> Result<VoiceActivityDetector, String> {
    let mut silero = SileroVadModelConfig::default();
    silero.model = Some(model_path.to_string_lossy().into_owned());
    silero.threshold = 0.5;
    silero.min_silence_duration = 0.5;
    silero.min_speech_duration = 0.25;
    silero.max_speech_duration = 20.0;
    let config = VadModelConfig {
        silero_vad: silero,
        sample_rate: TARGET_SAMPLE_RATE,
        num_threads: 1,
        provider: Some("cpu".to_owned()),
        debug: false,
        ..Default::default()
    };
    VoiceActivityDetector::create(&config, 30.0)
        .ok_or_else(|| "Could not initialize the voice activity detector.".to_owned())
}

fn create_audio_input() -> Result<(Stream, mpsc::Receiver<Vec<f32>>, u32), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone is available. Check the system sound settings.".to_owned())?;
    let supported = device
        .default_input_config()
        .map_err(|error| format!("Could not open the microphone: {error}"))?;
    let config: StreamConfig = supported.clone().into();
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate.0;
    let (tx, rx) = mpsc::channel();
    let stream = build_input_stream(&device, &config, supported.sample_format(), channels, tx)?;
    Ok((stream, rx, sample_rate))
}

fn build_input_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    channels: usize,
    sender: mpsc::Sender<Vec<f32>>,
) -> Result<Stream, String> {
    let on_error = |error| eprintln!("[s-loop-speech] microphone stream error: {error}");
    match sample_format {
        SampleFormat::F32 => device
            .build_input_stream(
                config,
                move |data: &[f32], _| {
                    send_mono(&sender, data, channels, |sample| sample);
                },
                on_error,
                None,
            )
            .map_err(|error| format!("Could not create microphone stream: {error}")),
        SampleFormat::I16 => device
            .build_input_stream(
                config,
                move |data: &[i16], _| {
                    send_mono(&sender, data, channels, |sample| {
                        sample as f32 / i16::MAX as f32
                    });
                },
                on_error,
                None,
            )
            .map_err(|error| format!("Could not create microphone stream: {error}")),
        SampleFormat::U16 => device
            .build_input_stream(
                config,
                move |data: &[u16], _| {
                    send_mono(&sender, data, channels, |sample| {
                        (sample as f32 / u16::MAX as f32) * 2.0 - 1.0
                    });
                },
                on_error,
                None,
            )
            .map_err(|error| format!("Could not create microphone stream: {error}")),
        other => Err(format!("Unsupported microphone sample format: {other:?}")),
    }
}

fn send_mono<T>(
    sender: &mpsc::Sender<Vec<f32>>,
    data: &[T],
    channels: usize,
    convert: impl Fn(T) -> f32,
) where
    T: Copy,
{
    if data.is_empty() {
        return;
    }
    let mono = data
        .chunks(channels.max(1))
        .map(|frame| frame.iter().copied().map(&convert).sum::<f32>() / frame.len().max(1) as f32)
        .collect();
    let _ = sender.send(mono);
}

fn input_level(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let mean_square =
        samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32;
    (mean_square.sqrt() * 8.0).clamp(0.0, 1.0)
}
