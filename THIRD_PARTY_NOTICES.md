# Third-party notices

## OpenWorker local speech-to-text design

The structure and portions of the local speech-to-text implementation in `stt/` were adapted from
OpenWorker's `ocw-stt` crate.

Copyright (c) 2024 Andrew Ng

Licensed under the MIT License. The full license text is available in the OpenWorker source
distribution and at <https://opensource.org/license/mit>.

## sherpa-onnx

Streaming speech recognition, voice activity detection, and text-to-speech use the sherpa-onnx
Rust API and native runtime.

Copyright (c) the sherpa-onnx contributors.

Licensed under the Apache License 2.0. See <https://github.com/k2-fsa/sherpa-onnx>.

Downloaded speech models remain under the licenses distributed inside their model archives.

## Sonora / WebRTC Audio Processing

Acoustic echo cancellation, noise suppression, high-pass filtering, and automatic gain control
use Sonora's pure-Rust port of the WebRTC Audio Processing Module.

Copyright (c) the Sonora and WebRTC contributors.

Licensed under the BSD 3-Clause License. See <https://github.com/dignifiedquire/sonora>.

## pptxgenjs

The pi-server bundles pptxgenjs, used by agents to generate native PowerPoint files.

Copyright 2015-2022 Brent Ely and pptxgenjs contributors.

Licensed under the MIT License. See <https://github.com/gitbrent/PptxGenJS>.

## OfficeCLI

PPTX layout-issue inspection, OOXML validation, and high-fidelity preview rendering use the
OfficeCLI binary, distributed via the `@officecli/officecli` npm package.

OfficeCLI, Copyright 2026 OfficeCLI (https://OfficeCLI.AI), created and maintained by goworm.

Licensed under the Apache License 2.0. Per its NOTICE, redistribution with or without
modification must retain this notice. See <https://github.com/iOfficeAI/OfficeCLI>.

## busybox-w32

The sandboxed shell runtime bundled at `src-tauri/pi-server/bin/busybox.exe` is busybox-w32.

Copyright (C) 1998-2024 Erik Andersen, Rob Landley, Denys Vlasenko and others.
Portions Copyright (C) 2001 Manuel Novoa III, 2000-2003 Glenn McGrath, 2008 Vladimir Dronnikov.

Licensed under the GNU General Public License version 2. Source code for this build is available at
<https://frippery.org/busybox/> and <https://git.busybox.net/busybox/>.
