# Local voice runtime

S-Loop keeps the real-time audio path in Rust and uses Tauri events as the typed boundary to the
React UI. Node.js and the agent server are not involved in microphone capture or audio playback.

## Capabilities

- Final local dictation uses multilingual Whisper Base. The transcript is inserted into the draft
  and is never sent automatically.
- Streaming captions use sherpa-onnx with a bilingual Chinese/English Zipformer model.
- Voice activity detection uses sherpa-onnx with Silero VAD.
- Text-to-speech uses sherpa-onnx with the Chinese/English Kokoro model.
- Voice conversation mode follows `listening → thinking → speaking → listening`. A finalized user
  turn is sent to the current chat, the final assistant response is spoken, and listening resumes
  after playback.
- Clicking the call button while the assistant is speaking stops playback and resumes listening.
  This is the initial interruption mechanism; acoustic echo cancellation is intentionally a later
  layer.

Streaming hypotheses are visually distinct from finalized text because partial results can be
revised by the recognizer.

## Architecture

- `stt/` is a Tauri-independent Rust crate.
  - `lib.rs` retains CPAL capture and Whisper final transcription.
  - `voice_assets.rs` downloads, safely extracts, validates, and deletes optional voice models.
  - `realtime.rs` owns CPAL capture, linear resampling, Silero VAD, Zipformer decoding, endpointing,
    and partial/final events.
  - `tts.rs` owns Kokoro initialization, incremental generation, CPAL/rodio playback, and
    cancellation.
- `src-tauri/src/dictation.rs` exposes final Whisper dictation.
- `src-tauri/src/voice.rs` exposes model management, streaming recognition, and speech playback.
- `src/utils/voiceRuntime.ts` is the typed frontend command/event boundary.
- `src/utils/voiceConversation.ts` owns the UI conversation state machine and converts assistant
  Markdown into speakable text.

Audio remains in memory. Model files are the only persistent voice data.

## Models

Models are downloaded only after explicit user action and are not bundled into `.exe` or `.msi`
installers.

| Capability | Model | Source |
| --- | --- | --- |
| Final dictation | Whisper Base multilingual | `ggerganov/whisper.cpp` |
| Streaming ASR | Streaming Zipformer bilingual zh/en | `k2-fsa/sherpa-onnx` releases |
| VAD | Silero VAD ONNX | `k2-fsa/sherpa-onnx` releases |
| TTS | Kokoro multi-language v1.0 | `k2-fsa/sherpa-onnx` releases |

Downloads use temporary `.part` files. Archives are extracted into a staging directory, archive
paths are checked for traversal, required model files are validated, and only then is the model
activated. Interrupted downloads and installations never replace an active model.

## Events

- `dictation-download-progress`
- `voice-asset-progress`
- `voice-realtime`
  - `state`
  - `level`
  - `speech-start`
  - `speech-end`
  - `partial`
  - `final`
  - `error`
- `voice-playback`
  - `loading`
  - `speaking`
  - `idle`
  - `error`

## Native build requirements

`whisper-rs` compiles whisper.cpp during the Rust build. The sherpa-onnx Rust crate downloads the
matching prebuilt static native library during its build. Windows build machines need Rust MSVC,
Visual Studio C++ Build Tools, a Windows SDK, CMake, and LLVM/libclang.

These are build-time requirements only. Installed S-Loop users do not need Node.js, Git, Python,
LLVM, CMake, or Visual Studio for voice features.

## Current audio limitation

The first real-time conversation implementation pauses microphone recognition while synthesized
speech is playing. This prevents the assistant from recognizing its own speaker output without
requiring a fragile software echo suppressor. Users can click the active call button to interrupt
playback and immediately resume listening. A future full-duplex mode should add a tested acoustic
echo-cancellation layer before keeping microphone recognition active during playback.
