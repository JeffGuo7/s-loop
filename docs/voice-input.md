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
The full-duplex processor additionally requires Rust 1.91 or newer.

These are build-time requirements only. Installed S-Loop users do not need Node.js, Git, Python,
LLVM, CMake, or Visual Studio for voice features.

On Windows, install LLVM from the
[official LLVM releases](https://github.com/llvm/llvm-project/releases) or with:

```powershell
choco install llvm -y
```

Use `npm run tauri:dev`, `npm run tauri:build`, `npm run native:check`, or
`npm run native:test:speech` for native development. The shared launcher locates `libclang.dll`,
the Clang resource headers, Visual Studio C++ headers, and the newest installed Windows SDK before
starting Cargo. This avoids machine-specific `LIBCLANG_PATH` and `BINDGEN_EXTRA_CLANG_ARGS`
configuration. Direct `cargo` commands remain possible from a Visual Studio Developer PowerShell
whose LLVM and C/C++ include paths have already been configured.

## Full-duplex audio processing

Conversation mode keeps microphone recognition active while synthesized speech is playing. The
speaker callback publishes the PCM frames that were actually rendered, and the microphone path
uses those frames as the reverse stream for a 16 kHz, 10 ms WebRTC AEC3 pipeline provided by
Sonora. The processed path is:

`microphone -> AEC3 -> high-pass filter -> noise suppression -> AGC2 -> Silero VAD + Sherpa ASR`

When cleaned near-end speech persists for at least 250 ms, the VAD emits `speech-start`. During
assistant playback, the UI waits for 350 ms of AEC warm-up and requires a cleaned input level of
at least 0.025 before stopping TTS. Recognition remains active, so the user's interrupted turn can
continue without reopening the microphone.

AEC quality depends on the capture/render device pair, driver buffering, room acoustics, and
speaker volume. Headsets naturally produce the best result. Built-in laptop speakers, USB audio,
and Bluetooth devices should be included in release testing; Bluetooth profile changes and
separate input/output sound cards can still reduce cancellation quality.
