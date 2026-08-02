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

use crate::download;

const STREAMING_ASR_DIR: &str = "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20";
const TTS_DIR: &str = "kokoro-multi-lang-v1_0";
const VAD_FILE: &str = "silero_vad.onnx";

const STREAMING_ASR_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2";
const TTS_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2";
const VAD_URL: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";

const MODELSCOPE_ASR_REVISION: &str = "658a5257f1342768b148d8b51c87e52a4e012262";
const MODELSCOPE_ASR_BASE: &str =
    "https://www.modelscope.cn/models/budaoshou/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20/resolve";
const MODELSCOPE_ASR_BYTES: u64 = 198_270_793;

struct ModelScopeFile {
    name: &'static str,
    bytes: u64,
    sha256: &'static str,
}

const MODELSCOPE_ASR_FILES: &[ModelScopeFile] = &[
    ModelScopeFile {
        name: "decoder-epoch-99-avg-1.int8.onnx",
        bytes: 13_091_040,
        sha256: "1a70c593d71e53f023f5f55b0b4cfff5055abb786ee3992e5f63dc2e273cc4fa",
    },
    ModelScopeFile {
        name: "encoder-epoch-99-avg-1.int8.onnx",
        bytes: 181_895_032,
        sha256: "8fa764187a261844f859d7143ebaa563af5d10adfece4c18a8f414c88cba2a9b",
    },
    ModelScopeFile {
        name: "joiner-epoch-99-avg-1.int8.onnx",
        bytes: 3_228_404,
        sha256: "1ed689c5ed19dbaa725d9d191bb4822b5f4855a39e1ffd28cbc1f340d25b2ee0",
    },
    ModelScopeFile {
        name: "tokens.txt",
        bytes: 56_317,
        sha256: "a8e0e4ec53810e433789b54a5c0134a7eaa2ffca595a6334d54c00da858841d3",
    },
];

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
            // The fallback archive predates GitHub's published digest metadata.
            // Its extracted contents are still checked for safe paths and required files.
            Self::StreamingAsr => None,
            Self::Tts => Some("c133d26353d776da730870dac7da07dbfc9a5e3bc80cc5e8e83ab6e823be7046"),
            Self::Vad => Some("9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"),
        }
    }

    fn required_files(self) -> &'static [&'static str] {
        match self {
            Self::StreamingAsr => &[
                "encoder-epoch-99-avg-1.int8.onnx",
                "decoder-epoch-99-avg-1.int8.onnx",
                "joiner-epoch-99-avg-1.int8.onnx",
                "tokens.txt",
            ],
            Self::Tts => &[
                "model.onnx",
                "voices.bin",
                "tokens.txt",
                "lexicon-us-en.txt",
                "lexicon-zh.txt",
                "date-zh.fst",
                "phone-zh.fst",
                "number-zh.fst",
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
        github_mirror: Option<&str>,
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

        let result = self.install_inner(kind, github_mirror, &mut on_progress);

        if let Ok(mut downloading) = self.downloading.lock() {
            downloading.remove(&kind);
        }
        self.cancel_download.store(false, Ordering::SeqCst);
        result
    }

    fn install_inner(
        &self,
        kind: VoiceAssetKind,
        github_mirror: Option<&str>,
        on_progress: &mut impl FnMut(VoiceAssetProgress),
    ) -> Result<(), String> {
        fs::create_dir_all(&self.root)
            .map_err(|error| format!("Could not create the voice model directory: {error}"))?;

        let partial = self.root.join(format!("{}.download.part", kind.as_str()));
        let staging = self.root.join(format!(".installing-{}", kind.as_str()));
        remove_path_if_exists(&partial)?;
        remove_path_if_exists(&staging)?;

        let mut failures = Vec::new();
        if kind == VoiceAssetKind::StreamingAsr {
            match self.install_modelscope_asr(&staging, on_progress) {
                Ok(()) => return Ok(()),
                Err(error) if is_canceled(&self.cancel_download) => return Err(error),
                Err(error) => {
                    failures.push(format!("ModelScope: {error}"));
                    remove_path_if_exists(&staging)?;
                }
            }
        }

        let mut sources = vec![("GitHub", kind.url().to_owned())];
        if let Some(url) = github_mirror_url(github_mirror, kind.url()) {
            if url != kind.url() {
                sources.push(("configured GitHub mirror", url));
            }
        }

        let agent = download::agent();
        for (label, url) in sources {
            remove_path_if_exists(&partial)?;
            remove_path_if_exists(&staging)?;
            match self.install_archive_or_file(
                kind,
                label,
                &url,
                &agent,
                &partial,
                &staging,
                on_progress,
            ) {
                Ok(()) => return Ok(()),
                Err(error) if is_canceled(&self.cancel_download) => return Err(error),
                Err(error) => failures.push(format!("{label}: {error}")),
            }
        }

        remove_path_if_exists(&partial)?;
        remove_path_if_exists(&staging)?;
        Err(format!(
            "Could not download {} from any configured source. {}",
            kind.display_name(),
            failures.join(" | ")
        ))
    }

    fn install_modelscope_asr(
        &self,
        staging: &Path,
        on_progress: &mut impl FnMut(VoiceAssetProgress),
    ) -> Result<(), String> {
        fs::create_dir_all(staging)
            .map_err(|error| format!("Could not prepare ModelScope installation: {error}"))?;
        let direct_agent = download::direct_agent();
        let proxy_agent = download::agent();
        let mut completed = 0_u64;

        for file in MODELSCOPE_ASR_FILES {
            let url = format!(
                "{MODELSCOPE_ASR_BASE}/{MODELSCOPE_ASR_REVISION}/{}",
                file.name
            );
            let destination = staging.join(file.name);
            let direct_result = download_file(
                VoiceAssetKind::StreamingAsr,
                "ModelScope direct",
                &direct_agent,
                &url,
                &destination,
                Some(file.sha256),
                Some(file.bytes),
                completed,
                MODELSCOPE_ASR_BYTES,
                &self.cancel_download,
                on_progress,
            );
            if let Err(direct_error) = direct_result {
                if is_canceled(&self.cancel_download) {
                    return Err(direct_error);
                }
                remove_path_if_exists(&destination)?;
                download_file(
                    VoiceAssetKind::StreamingAsr,
                    "ModelScope through system proxy",
                    &proxy_agent,
                    &url,
                    &destination,
                    Some(file.sha256),
                    Some(file.bytes),
                    completed,
                    MODELSCOPE_ASR_BYTES,
                    &self.cancel_download,
                    on_progress,
                )
                .map_err(|proxy_error| {
                    format!(
                        "{} failed directly ({direct_error}) and through the system proxy ({proxy_error})",
                        file.name
                    )
                })?;
            }
            completed += file.bytes;
        }

        on_progress(VoiceAssetProgress {
            kind: VoiceAssetKind::StreamingAsr,
            phase: "installing",
            downloaded_bytes: completed,
            total_bytes: MODELSCOPE_ASR_BYTES,
        });
        validate_asset(VoiceAssetKind::StreamingAsr, staging)?;
        activate_directory(
            staging,
            &self.asset_path(VoiceAssetKind::StreamingAsr),
            VoiceAssetKind::StreamingAsr,
        )?;
        report_ready(VoiceAssetKind::StreamingAsr, on_progress);
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn install_archive_or_file(
        &self,
        kind: VoiceAssetKind,
        source_label: &str,
        url: &str,
        agent: &ureq::Agent,
        partial: &Path,
        staging: &Path,
        on_progress: &mut impl FnMut(VoiceAssetProgress),
    ) -> Result<(), String> {
        download_file(
            kind,
            source_label,
            agent,
            url,
            partial,
            kind.sha256(),
            None,
            0,
            0,
            &self.cancel_download,
            on_progress,
        )?;
        if is_canceled(&self.cancel_download) {
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
                fs::create_dir_all(staging)
                    .map_err(|error| format!("Could not prepare model extraction: {error}"))?;
                extract_tar_bz2(partial, staging)?;
                let extracted = staging.join(archive_root);
                validate_asset(kind, &extracted)?;
                activate_directory(&extracted, &self.asset_path(kind), kind)?;
                remove_path_if_exists(staging)?;
            }
            None => {
                let target = self.asset_path(kind);
                remove_path_if_exists(&target)?;
                fs::rename(partial, &target)
                    .map_err(|error| format!("Could not activate the voice model: {error}"))?;
                validate_asset(kind, &target)?;
            }
        }
        remove_path_if_exists(partial)?;
        report_ready(kind, on_progress);
        Ok(())
    }

    pub fn cancel_download(&self) {
        self.cancel_download.store(true, Ordering::SeqCst);
    }

    pub fn delete(&self, kind: VoiceAssetKind) -> Result<(), String> {
        self.cancel_download();
        remove_path_if_exists(&self.asset_path(kind)).map_err(|error| {
            format!(
                "Could not delete {}: {}",
                kind.display_name(),
                error.trim_start_matches("Could not remove an incomplete voice model: ")
            )
        })
    }
}

#[allow(clippy::too_many_arguments)]
fn download_file(
    kind: VoiceAssetKind,
    source_label: &str,
    agent: &ureq::Agent,
    url: &str,
    destination: &Path,
    expected_sha256: Option<&str>,
    expected_bytes: Option<u64>,
    progress_offset: u64,
    progress_total: u64,
    cancel: &AtomicBool,
    on_progress: &mut impl FnMut(VoiceAssetProgress),
) -> Result<(), String> {
    let response = agent.get(url).call().map_err(|error| {
        format!(
            "{source_label} could not start the {} download: {error}",
            kind.display_name()
        )
    })?;
    let response_bytes = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let total_bytes = if progress_total > 0 {
        progress_total
    } else {
        expected_bytes.unwrap_or(response_bytes)
    };
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
        downloaded_bytes: progress_offset,
        total_bytes,
    });
    loop {
        if is_canceled(cancel) {
            return Err("Voice model download canceled.".to_owned());
        }
        let count = input.read(&mut buffer).map_err(|error| {
            format!(
                "{source_label} interrupted the {} download: {error}",
                kind.display_name()
            )
        })?;
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
                downloaded_bytes: progress_offset + downloaded_bytes,
                total_bytes,
            });
        }
    }
    output
        .flush()
        .map_err(|error| format!("Could not finish saving {}: {error}", kind.display_name()))?;

    if let Some(expected) = expected_bytes {
        if downloaded_bytes != expected {
            return Err(format!(
                "{source_label} returned an incomplete {} file (expected {expected} bytes, received {downloaded_bytes}).",
                kind.display_name()
            ));
        }
    }
    if let Some(expected) = expected_sha256 {
        let actual = format!("{:x}", hasher.finalize());
        if actual != expected {
            return Err(format!(
                "{source_label} returned a {} file that failed SHA-256 verification.",
                kind.display_name()
            ));
        }
    }
    on_progress(VoiceAssetProgress {
        kind,
        phase: "downloading",
        downloaded_bytes: progress_offset + downloaded_bytes,
        total_bytes: total_bytes.max(progress_offset + downloaded_bytes),
    });
    Ok(())
}

fn report_ready(kind: VoiceAssetKind, on_progress: &mut impl FnMut(VoiceAssetProgress)) {
    on_progress(VoiceAssetProgress {
        kind,
        phase: "ready",
        downloaded_bytes: 0,
        total_bytes: 0,
    });
}

fn activate_directory(source: &Path, target: &Path, kind: VoiceAssetKind) -> Result<(), String> {
    remove_path_if_exists(target).map_err(|error| {
        format!(
            "Could not replace the existing {}: {error}",
            kind.display_name()
        )
    })?;
    fs::rename(source, target)
        .map_err(|error| format!("Could not activate the voice model: {error}"))
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Could not remove an incomplete voice model: {error}"))?;
    } else if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not remove an incomplete voice model: {error}"))?;
    }
    Ok(())
}

fn is_canceled(cancel: &AtomicBool) -> bool {
    cancel.load(Ordering::SeqCst)
}

fn github_mirror_url(mirror: Option<&str>, original: &str) -> Option<String> {
    let mirror = mirror?.trim();
    if mirror.is_empty() {
        return None;
    }
    if mirror.contains("{url}") {
        return Some(mirror.replace("{url}", original));
    }
    let github_path = original
        .strip_prefix("https://github.com/")
        .unwrap_or(original);
    if mirror.ends_with("/https://github.com/") {
        return Some(format!("{mirror}{github_path}"));
    }
    Some(format!("{}/{}", mirror.trim_end_matches('/'), original))
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

#[cfg(test)]
mod tests {
    use super::{github_mirror_url, VoiceAssetKind};

    const GITHUB: &str =
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";

    #[test]
    fn expands_the_default_github_mirror_prefix() {
        assert_eq!(
            github_mirror_url(
                Some("https://mirror.ghproxy.com/https://github.com/"),
                GITHUB
            )
            .as_deref(),
            Some(
                "https://mirror.ghproxy.com/https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
            )
        );
    }

    #[test]
    fn supports_a_url_placeholder() {
        assert_eq!(
            github_mirror_url(Some("https://mirror.example/?target={url}"), GITHUB).as_deref(),
            Some(
                "https://mirror.example/?target=https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
            )
        );
    }

    #[test]
    fn kokoro_requires_the_chinese_text_normalization_rules() {
        let files = VoiceAssetKind::Tts.required_files();
        assert!(files.contains(&"date-zh.fst"));
        assert!(files.contains(&"phone-zh.fst"));
        assert!(files.contains(&"number-zh.fst"));
    }
}
