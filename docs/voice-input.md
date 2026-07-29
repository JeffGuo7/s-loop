# Local voice input

Snotra's first voice feature intentionally matches OpenWorker's current scope: local dictation
only. It does not implement text-to-speech, a voice assistant loop, partial streaming transcripts,
or remote audio processing.

## Architecture

- `stt/` is a Tauri-independent Rust crate that owns microphone capture, model provisioning, and
  final Whisper transcription.
- `src-tauri/src/dictation.rs` exposes the engine as Tauri commands and reports compatibility.
- `src/utils/voiceInput.ts` is the typed frontend boundary.
- Settings own model download, checksum verification, microphone testing, and deletion.
- The chat input owns the recording UX. A transcript is appended to the editable draft and is
  never sent automatically.

Audio samples remain in memory for the active recording and are discarded after transcription or
cancel. The only persistent files are the downloaded model and small verification/readiness
markers in the app data `models` directory.

## Model

Snotra uses multilingual Whisper Base (`ggml-base.bin`) so Chinese and English can be detected
automatically. The model is downloaded on explicit user action and is not bundled into `.exe`,
`.msi`, or `.dmg` installers.

- Download size: `147951465` bytes
- SHA-256: `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`
- Source: `ggerganov/whisper.cpp` on Hugging Face

Downloads are written to a `.part` file, can be cancelled, and only replace the active model after
both the expected size and SHA-256 pass.

## Native build requirements

`whisper-rs` compiles whisper.cpp during the Rust build. Build machines need:

- Rust with the MSVC target on Windows
- Visual Studio C++ Build Tools and a Windows SDK
- CMake
- LLVM/libclang (set `LIBCLANG_PATH` if it is not discoverable)

These are build-time requirements only. End users do not need Node.js, Git, Python, LLVM, CMake, or
Visual Studio to use voice input in an installed Snotra build.

macOS builds also merge `src-tauri/Info.plist`, which contains the microphone usage description.
