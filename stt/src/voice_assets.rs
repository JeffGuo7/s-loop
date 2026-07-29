use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

use bzip2::read::BzDecoder;
use serde::Serialize;
use sha2::{Digest, Sha256};

const STREAMING_ASR_DIR: &str = "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20";
const TTS_DIR: &str = "kokoro-multi-lang-v1_0";
const VAD_FILE: &str = "silero_vad.onnx";

const STREAMING_ASR_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2";
const TTS_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2";
const VAD_URL: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum VoiceAssetKind {
    StreamingAsr,
    Tts,
    Vad,
}

impl VoiceAssetKind {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "streaming-asr" => Ok(Self::StreamingAsr),
            "tts" => Ok(Self::Tts),
            "vad" => Ok(Self::Vad),
            _ => Err(format!("Unknown voice asset: {value}")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::StreamingAsr => "streaming-asr",
            Self::Tts => "tts",
            Self::Vad => "vad",
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::StreamingAsr => "Streaming Zipformer Chinese + English",
            Self::Tts => "Kokoro Chinese + English",
            Self::Vad => "Silero voice activity detector",
        }
    }

    fn url(self) -> &'static str {
        match self {
            Self::StreamingAsr => STREAMING_ASR_URL,
            Self::Tts => TTS_URL,
            Self::Vad => VAD_URL,
        }
    }

    fn sha256(self) -> Option<&'static str> {
        match self {
            // This older release asset predates GitHub's published digest
            // metadata. It is still checked for safe paths and required files.
            Self::StreamingAsr => None,
            Self::Tts => Some("c133d26353d776da730870dac7da07dbfc9a5e3bc80cc5e8e83ab6e823be7046"),
            Self::Vad => Some("9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"),
        }
    }

    fn required_files(self) -> &'static [&'static str] {
        match self {
            Self::StreamingAsr => &[
                "encoder-epoch-99-avg-1.int8.onnx",
                "decoder-epoch-99-avg-1.onnx",
                "joiner-epoch-99-avg-1.int8.onnx",
                "tokens.txt",
            ],
            Self::Tts => &[
                "model.onnx",
                "voices.bin",
                "tokens.txt",
                "lexicon-us-en.txt",
                "lexicon-zh.txt",
                "espeak-ng-data",
                "dict",
            ],
            Self::Vad => &[VAD_FILE],
        }
    }

    fn archive_root(self) -> Option<&'static str> {
        match self {
            Self::StreamingAsr => Some(STREAMING_ASR_DIR),
            Self::Tts => Some(TTS_DIR),
            Self::Vad => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceAssetStatus {
    pub kind: VoiceAssetKind,
    pub name: &'static str,
    pub installed: bool,
    pub download_in_progress: bool,
    pub disk_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceAssetProgress {
    pub kind: VoiceAssetKind,
    pub phase: &'static str,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

pub struct VoiceAssets {
    root: PathBuf,
    downloading: Mutex<HashSet<VoiceAssetKind>>,
    cancel_download: AtomicBool,
}

impl VoiceAssets {
    pub fn new(model_root: impl Into<PathBuf>) -> Self {
        Self {
            root: model_root.into().join("voice-runtime"),
            downloading: Mutex::new(HashSet::new()),
            cancel_download: AtomicBool::new(false),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn asset_path(&self, kind: VoiceAssetKind) -> PathBuf {
        match kind {
            VoiceAssetKind::StreamingAsr => self.root.join(STREAMING_ASR_DIR),
            VoiceAssetKind::Tts => self.root.join(TTS_DIR),
            VoiceAssetKind::Vad => self.root.join(VAD_FILE),
        }
    }

    pub fn is_installed(&self, kind: VoiceAssetKind) -> bool {
        let path = self.asset_path(kind);
        kind.required_files().iter().all(|entry| {
            let candidate = if kind == VoiceAssetKind::Vad {
                path.clone()
            } else {
                path.join(entry)
            };
            candidate.exists()
        })
    }

    pub fn statuses(&self) -> Vec<VoiceAssetStatus> {
        let downloading = self.downloading.lock().ok();
        [
            VoiceAssetKind::StreamingAsr,
            VoiceAssetKind::Vad,
            VoiceAssetKind::Tts,
        ]
        .into_iter()
        .map(|kind| {
            let path = self.asset_path(kind);
            VoiceAssetStatus {
                kind,
                name: kind.display_name(),
                installed: self.is_installed(kind),
                download_in_progress: downloading
                    .as_ref()
                    .map(|active| active.contains(&kind))
                    .unwrap_or(false),
                disk_bytes: path_size(&path),
            }
        })
        .collect()
    }

    pub fn install(
        &self,
        kind: VoiceAssetKind,
        mut on_progress: impl FnMut(VoiceAssetProgress),
    ) -> Result<(), String> {
        if self.is_installed(kind) {
            return Ok(());
        }
        {
            let mut downloading = self
                .downloading
                .lock()
                .map_err(|_| "Voice model download state is unavailable.".to_owned())?;
            if !downloading.is_empty() {
                return Err("Another voice model is already downloading.".to_owned());
            }
            downloading.insert(kind);
        }
        self.cancel_download.store(false, Ordering::SeqCst);

        let result = self.install_inner(kind, &mut on_progress);

        if let Ok(mut downloading) = self.downloading.lock() {
            downloading.remove(&kind);
        }
        self.cancel_download.store(false, Ordering::SeqCst);
        result
    }

    fn install_inner(
        &self,
        kind: VoiceAssetKind,
        on_progress: &mut impl FnMut(VoiceAssetProgress),
    ) -> Result<(), String> {
        fs::create_dir_all(&self.root)
            .map_err(|error| format!("Could not create the voice model directory: {error}"))?;

        let partial = self.root.join(format!("{}.download.part", kind.as_str()));
        let staging = self.root.join(format!(".installing-{}", kind.as_str()));
        if partial.exists() {
            fs::remove_file(&partial)
                .map_err(|error| format!("Could not replace an incomplete download: {error}"))?;
        }
        if staging.exists() {
            fs::remove_dir_all(&staging)
                .map_err(|error| format!("Could not reset an incomplete installation: {error}"))?;
        }

        let download_result = download_file(
            kind,
            kind.url(),
            &partial,
            &self.cancel_download,
            on_progress,
        );
        if let Err(error) = download_result {
            let _ = fs::remove_file(&partial);
            return Err(error);
        }
        if self.cancel_download.load(Ordering::SeqCst) {
            let _ = fs::remove_file(&partial);
            return Err("Voice model download canceled.".to_owned());
        }

        on_progress(VoiceAssetProgress {
            kind,
            phase: "installing",
            downloaded_bytes: 0,
            total_bytes: 0,
        });

        match kind.archive_root() {
            Some(archive_root) => {
                fs::create_dir_all(&staging)
                    .map_err(|error| format!("Could not prepare model extraction: {error}"))?;
                extract_tar_bz2(&partial, &staging)?;
                let extracted = staging.join(archive_root);
                validate_asset(kind, &extracted)?;
                let target = self.asset_path(kind);
                if target.exists() {
                    fs::remove_dir_all(&target).map_err(|error| {
                        format!("Could not replace the existing voice model: {error}")
                    })?;
                }
                fs::rename(&extracted, &target)
                    .map_err(|error| format!("Could not activate the voice model: {error}"))?;
                let _ = fs::remove_dir_all(&staging);
            }
            None => {
                let target = self.asset_path(kind);
                if target.exists() {
                    fs::remove_file(&target).map_err(|error| {
                        format!("Could not replace the existing voice model: {error}")
                    })?;
                }
                fs::rename(&partial, &target)
                    .map_err(|error| format!("Could not activate the voice model: {error}"))?;
                validate_asset(kind, &target)?;
            }
        }
        let _ = fs::remove_file(&partial);

        on_progress(VoiceAssetProgress {
            kind,
            phase: "ready",
            downloaded_bytes: 0,
            total_bytes: 0,
        });
        Ok(())
    }

    pub fn cancel_download(&self) {
        self.cancel_download.store(true, Ordering::SeqCst);
    }

    pub fn delete(&self, kind: VoiceAssetKind) -> Result<(), String> {
        self.cancel_download();
        let target = self.asset_path(kind);
        if target.is_dir() {
            fs::remove_dir_all(&target)
                .map_err(|error| format!("Could not delete {}: {error}", kind.display_name()))?;
        } else if target.exists() {
            fs::remove_file(&target)
                .map_err(|error| format!("Could not delete {}: {error}", kind.display_name()))?;
        }
        Ok(())
    }
}

fn download_file(
    kind: VoiceAssetKind,
    url: &str,
    destination: &Path,
    cancel: &AtomicBool,
    on_progress: &mut impl FnMut(VoiceAssetProgress),
) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(30))
        .timeout_read(std::time::Duration::from_secs(60))
        .try_proxy_from_env(true)
        .build();
    let response = agent
        .get(url)
        .call()
        .map_err(|error| format!("Could not download {}: {error}", kind.display_name()))?;
    let total_bytes = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let mut input = response.into_reader();
    let mut output = fs::File::create(destination)
        .map_err(|error| format!("Could not save {}: {error}", kind.display_name()))?;
    let mut downloaded_bytes = 0_u64;
    let mut last_reported = 0_u64;
    let mut buffer = [0_u8; 128 * 1024];
    let mut hasher = Sha256::new();

    on_progress(VoiceAssetProgress {
        kind,
        phase: "downloading",
        downloaded_bytes: 0,
        total_bytes,
    });
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("Voice model download canceled.".to_owned());
        }
        let count = input
            .read(&mut buffer)
            .map_err(|error| format!("Could not download {}: {error}", kind.display_name()))?;
        if count == 0 {
            break;
        }
        output
            .write_all(&buffer[..count])
            .map_err(|error| format!("Could not save {}: {error}", kind.display_name()))?;
        hasher.update(&buffer[..count]);
        downloaded_bytes += count as u64;
        if downloaded_bytes.saturating_sub(last_reported) >= 512 * 1024 {
            last_reported = downloaded_bytes;
            on_progress(VoiceAssetProgress {
                kind,
                phase: "downloading",
                downloaded_bytes,
                total_bytes,
            });
        }
    }
    output
        .flush()
        .map_err(|error| format!("Could not finish saving {}: {error}", kind.display_name()))?;
    if let Some(expected) = kind.sha256() {
        let actual = format!("{:x}", hasher.finalize());
        if actual != expected {
            return Err(format!(
                "The downloaded {} failed SHA-256 verification.",
                kind.display_name()
            ));
        }
    }
    on_progress(VoiceAssetProgress {
        kind,
        phase: "downloading",
        downloaded_bytes,
        total_bytes: total_bytes.max(downloaded_bytes),
    });
    Ok(())
}

fn extract_tar_bz2(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let archive_file = fs::File::open(archive_path)
        .map_err(|error| format!("Could not open the downloaded model: {error}"))?;
    let decoder = BzDecoder::new(archive_file);
    let mut archive = tar::Archive::new(decoder);
    let entries = archive
        .entries()
        .map_err(|error| format!("Could not read the downloaded model archive: {error}"))?;
    for entry in entries {
        let mut entry =
            entry.map_err(|error| format!("Could not extract the voice model: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("Invalid path in voice model archive: {error}"))?;
        if path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return Err("The downloaded voice model archive contains an unsafe path.".to_owned());
        }
        entry
            .unpack_in(destination)
            .map_err(|error| format!("Could not extract the voice model: {error}"))?;
    }
    Ok(())
}

fn validate_asset(kind: VoiceAssetKind, root: &Path) -> Result<(), String> {
    for required in kind.required_files() {
        let candidate = if kind == VoiceAssetKind::Vad {
            root.to_path_buf()
        } else {
            root.join(required)
        };
        if !candidate.exists() {
            return Err(format!(
                "The downloaded {} is incomplete; missing {}.",
                kind.display_name(),
                required
            ));
        }
    }
    Ok(())
}

fn path_size(path: &Path) -> u64 {
    let Ok(metadata) = fs::metadata(path) else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| path_size(&entry.path()))
        .sum()
}
