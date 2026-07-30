import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Download,
  LoaderCircle,
  Radio,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import i18n from '../../i18n'
import { useAppStore } from '../../stores/appStore'
import {
  cancelVoiceAssetDownload,
  deleteVoiceAsset,
  downloadVoiceAsset,
  getVoiceRuntimeStatus,
  listenSpeechPlayback,
  listenVoiceAssetProgress,
  speakText,
  stopSpeaking,
  voiceAsset,
  type SpeechPlaybackEvent,
  type VoiceAssetKind,
  type VoiceAssetProgress,
  type VoiceRuntimeStatus,
} from '../../utils/voiceRuntime'

const text = {
  en: {
    title: 'Real-time voice',
    description:
      'Optional on-device models add partial captions, voice activity detection, and Chinese/English speech playback.',
    streaming: 'Streaming captions',
    streamingHint: 'Zipformer produces revisable partial text while you speak.',
    vad: 'Voice activity detection',
    vadHint: 'Silero detects speech boundaries for continuous conversation.',
    tts: 'Text-to-speech',
    ttsHint: 'Kokoro speaks assistant responses locally in Chinese and English.',
    download: 'Download',
    remove: 'Delete',
    cancel: 'Cancel',
    test: 'Test voice',
    stop: 'Stop',
    installed: 'Installed',
    optional: 'Not installed',
    downloading: 'Downloading',
    installing: 'Installing',
    ready: 'Real-time captions are ready',
    notReady: 'Install both streaming recognition and VAD to enable real-time voice.',
  },
  zh: {
    title: '实时语音',
    description: '可选的本地模型提供流式中间字幕、语音活动检测和中英文语音播放。',
    streaming: '流式中间字幕',
    streamingHint: 'Zipformer 会在说话过程中持续输出可修订的识别结果。',
    vad: '语音活动检测',
    vadHint: 'Silero 用于判断开始说话、结束说话和连续对话轮次。',
    tts: '文字转语音',
    ttsHint: 'Kokoro 在本地朗读助手的中文和英文回答。',
    download: '下载',
    remove: '删除',
    cancel: '取消',
    test: '测试语音',
    stop: '停止',
    installed: '已安装',
    optional: '未安装',
    downloading: '正在下载',
    installing: '正在安装',
    ready: '实时字幕已经就绪',
    notReady: '安装流式识别和 VAD 后即可使用实时语音。',
  },
}

const formatBytes = (bytes: number) => {
  if (!bytes) return ''
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function VoiceRuntimeSettings() {
  const copy = i18n.resolvedLanguage?.startsWith('zh') ? text.zh : text.en
  const githubMirror = useAppStore((state) => state.githubMirror)
  const [status, setStatus] = useState<VoiceRuntimeStatus | null>(null)
  const [progress, setProgress] = useState<VoiceAssetProgress | null>(null)
  const [busy, setBusy] = useState<VoiceAssetKind | null>(null)
  const [playback, setPlayback] = useState<SpeechPlaybackEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    const next = await getVoiceRuntimeStatus()
    setStatus(next)
    return next
  }

  useEffect(() => {
    void refresh().catch((reason) => setError(String(reason)))
    let disposeProgress: (() => void) | undefined
    let disposePlayback: (() => void) | undefined
    void listenVoiceAssetProgress(setProgress).then((dispose) => {
      disposeProgress = dispose
    })
    void listenSpeechPlayback(setPlayback).then((dispose) => {
      disposePlayback = dispose
    })
    return () => {
      disposeProgress?.()
      disposePlayback?.()
    }
  }, [])

  const realtimeReady =
    !!voiceAsset(status, 'streaming-asr')?.installed &&
    !!voiceAsset(status, 'vad')?.installed
  const percent = useMemo(() => {
    if (!progress?.totalBytes) return 0
    return Math.min(
      100,
      Math.round((progress.downloadedBytes / progress.totalBytes) * 100),
    )
  }, [progress])

  const install = async (kind: VoiceAssetKind) => {
    setBusy(kind)
    setProgress(null)
    setError(null)
    try {
      setStatus(await downloadVoiceAsset(kind, githubMirror))
    } catch (reason) {
      setError(String(reason))
      await refresh().catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (kind: VoiceAssetKind) => {
    setBusy(kind)
    setError(null)
    try {
      setStatus(await deleteVoiceAsset(kind))
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(null)
    }
  }

  const testSpeech = async () => {
    setError(null)
    try {
      if (playback?.state === 'loading' || playback?.state === 'speaking') {
        await stopSpeaking()
      } else {
        const sample = i18n.resolvedLanguage?.startsWith('zh')
          ? '你好，我是 S-Loop。本地语音播放已经准备好了。'
          : 'Hello, this is S-Loop. Local voice playback is ready.'
        await speakText(sample)
      }
    } catch (reason) {
      setError(String(reason))
    }
  }

  const cards: Array<{
    kind: VoiceAssetKind
    title: string
    hint: string
    icon: typeof Radio
  }> = [
    {
      kind: 'streaming-asr',
      title: copy.streaming,
      hint: copy.streamingHint,
      icon: Radio,
    },
    { kind: 'vad', title: copy.vad, hint: copy.vadHint, icon: Activity },
    { kind: 'tts', title: copy.tts, hint: copy.ttsHint, icon: Volume2 },
  ]

  return (
    <div className="rounded-[24px] border border-border-light bg-surface p-6">
      <div className="mb-5">
        <h4 className="text-lg font-bold text-text">{copy.title}</h4>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {copy.description}
        </p>
      </div>

      <div className="space-y-3">
        {cards.map(({ kind, title, hint, icon: Icon }) => {
          const asset = voiceAsset(status, kind)
          const downloading =
            busy === kind || asset?.downloadInProgress === true
          const currentProgress = progress?.kind === kind ? progress : null
          return (
            <div
              key={kind}
              className="rounded-2xl border border-border-light bg-surface-secondary/50 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-accent-subtle p-2 text-accent">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="font-bold text-text">{title}</h5>
                    <span
                      className={`text-xs font-bold ${
                        asset?.installed ? 'text-green-600' : 'text-text-tertiary'
                      }`}
                    >
                      {asset?.installed ? copy.installed : copy.optional}
                      {asset?.diskBytes ? ` · ${formatBytes(asset.diskBytes)}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {hint}
                  </p>

                  {downloading && currentProgress && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[11px] text-text-tertiary">
                        <span>
                          {currentProgress.phase === 'installing'
                            ? copy.installing
                            : copy.downloading}
                        </span>
                        <span>
                          {currentProgress.totalBytes ? `${percent}%` : ''}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className={`h-full bg-accent ${
                            currentProgress.totalBytes ? '' : 'w-1/3 animate-pulse'
                          }`}
                          style={
                            currentProgress.totalBytes
                              ? { width: `${percent}%` }
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!asset?.installed && !downloading && (
                      <button
                        className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white"
                        onClick={() => void install(kind)}
                      >
                        <Download size={14} /> {copy.download}
                      </button>
                    )}
                    {downloading && (
                      <button
                        className="flex items-center gap-1.5 rounded-xl bg-surface-tertiary px-3 py-2 text-xs font-bold"
                        onClick={() => void cancelVoiceAssetDownload()}
                      >
                        <X size={14} /> {copy.cancel}
                      </button>
                    )}
                    {asset?.installed && kind === 'tts' && (
                      <button
                        className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white"
                        onClick={() => void testSpeech()}
                      >
                        {playback?.state === 'loading' ||
                        playback?.state === 'speaking' ? (
                          <Square size={13} fill="currentColor" />
                        ) : (
                          <Volume2 size={14} />
                        )}
                        {playback?.state === 'loading'
                          ? copy.installing
                          : playback?.state === 'speaking'
                            ? copy.stop
                            : copy.test}
                      </button>
                    )}
                    {asset?.installed && (
                      <button
                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10"
                        disabled={busy !== null}
                        onClick={() => void remove(kind)}
                      >
                        {busy === kind ? (
                          <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        {copy.remove}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          {error}
        </div>
      )}
      <div
        className={`mt-4 rounded-2xl px-5 py-4 text-sm font-bold ${
          realtimeReady
            ? 'bg-green-500/10 text-green-600'
            : 'bg-amber-500/10 text-amber-600'
        }`}
      >
        {realtimeReady ? copy.ready : copy.notReady}
      </div>
    </div>
  )
}
