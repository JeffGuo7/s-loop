import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  Download,
  LoaderCircle,
  Radio,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import i18n from '../../i18n'
import {
  getKokoroVoiceLabel,
  getKokoroVoice,
  KOKORO_VOICES,
  type KokoroVoiceGender,
} from '../../config/kokoroVoices'
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
    voice: 'Voice library',
    voiceHint: '53 bundled identities. Chinese is recommended; other voices may add an accent when reading Chinese.',
    recommended: 'Recommended Chinese',
    american: 'American',
    british: 'British',
    other: 'Other accents',
    allVoices: 'All 53 · 全部 53',
    allGenders: 'All voices',
    searchVoice: 'Search name or ID',
    experimental: 'Experimental for Chinese',
    female: 'Female',
    male: 'Male',
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
    voice: '音色库',
    voiceHint: '内置 53 个声线身份。中文音色效果最稳定，其他声线朗读中文时可能带口音。',
    recommended: '推荐中文',
    american: '美式',
    british: '英式',
    other: '其他口音',
    allVoices: '全部 53 · All 53',
    allGenders: '全部声线',
    searchVoice: '搜索名称或 ID',
    experimental: '中文实验效果',
    female: '女声',
    male: '男声',
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

const REGION_LABELS = {
  en: {
    american: 'American', british: 'British', spanish: 'Spanish', french: 'French',
    hindi: 'Hindi', italian: 'Italian', japanese: 'Japanese', portuguese: 'Portuguese', chinese: 'Chinese',
  },
  zh: {
    american: '美式', british: '英式', spanish: '西班牙', french: '法国',
    hindi: '印度', italian: '意大利', japanese: '日本', portuguese: '葡萄牙', chinese: '中文',
  },
} as const

export function VoiceRuntimeSettings() {
  const chinese = i18n.resolvedLanguage?.startsWith('zh') ?? false
  const copy = chinese ? text.zh : text.en
  const githubMirror = useAppStore((state) => state.githubMirror)
  const kokoroSpeakerId = useAppStore((state) => state.kokoroSpeakerId)
  const setKokoroSpeakerId = useAppStore((state) => state.setKokoroSpeakerId)
  const selectedVoice = getKokoroVoice(kokoroSpeakerId)
  const [voiceTab, setVoiceTab] = useState<'recommended' | 'american' | 'british' | 'other' | 'all'>(() => {
    if (selectedVoice.region === 'chinese') return 'recommended'
    if (selectedVoice.region === 'american') return 'american'
    if (selectedVoice.region === 'british') return 'british'
    return 'other'
  })
  const [voiceGender, setVoiceGender] = useState<'all' | KokoroVoiceGender>('all')
  const [voiceQuery, setVoiceQuery] = useState('')
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

  const visibleVoices = useMemo(() => {
    const query = voiceQuery.trim().toLowerCase()
    return KOKORO_VOICES.filter((voice) => {
      const inTab =
        voiceTab === 'all' ||
        (voiceTab === 'recommended' && voice.region === 'chinese') ||
        (voiceTab === 'american' && voice.region === 'american') ||
        (voiceTab === 'british' && voice.region === 'british') ||
        (voiceTab === 'other' && !['chinese', 'american', 'british'].includes(voice.region))
      const matchesGender = voiceGender === 'all' || voice.gender === voiceGender
      const label = getKokoroVoiceLabel(voice, chinese).toLowerCase()
      const matchesQuery = !query || label.includes(query) || voice.modelName.includes(query) || String(voice.id) === query
      return inTab && matchesGender && matchesQuery
    })
  }, [chinese, voiceGender, voiceQuery, voiceTab])

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
        const sample = selectedVoice.textLanguage === 'zh'
          ? '你好，我是 S-Loop。本地语音播放已经准备好了。'
          : 'Hello, this is S-Loop. Local voice playback is ready.'
        await speakText(sample, 1, kokoroSpeakerId)
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
    <div className="settings-section">
      <div className="mb-4">
        <h4 className="text-[15px] font-semibold text-text">{copy.title}</h4>
        <p className="mt-1.5 text-[13px] leading-5 text-text-secondary">
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
              className="rounded-lg border border-border bg-surface-secondary/45 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-accent-subtle p-2 text-accent">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="font-semibold text-text">{title}</h5>
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

                  {asset?.installed && kind === 'tts' && (
                    <fieldset className="mt-4 rounded-lg border border-border/80 bg-surface p-3">
                      <legend className="sr-only">{copy.voice}</legend>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-text">
                            {copy.voice}
                          </div>
                          <p className="mt-0.5 text-[11px] leading-4 text-text-tertiary">
                            {copy.voiceHint}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-accent-subtle px-2 py-1 text-[10px] font-bold text-accent">
                          Kokoro · {selectedVoice.id}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {([
                          ['recommended', copy.recommended],
                          ['american', copy.american],
                          ['british', copy.british],
                          ['other', copy.other],
                          ['all', copy.allVoices],
                        ] as const).map(([tab, label]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setVoiceTab(tab)}
                            className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                              voiceTab === tab
                                ? 'bg-accent text-accent-foreground'
                                : 'bg-surface-secondary text-text-secondary hover:text-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input
                          type="search"
                          value={voiceQuery}
                          onChange={(event) => setVoiceQuery(event.target.value)}
                          placeholder={copy.searchVoice}
                          aria-label={copy.searchVoice}
                          className="min-w-36 flex-1 rounded-lg border border-border bg-surface-secondary/60 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                        />
                        <select
                          value={voiceGender}
                          onChange={(event) => setVoiceGender(event.target.value as 'all' | KokoroVoiceGender)}
                          aria-label={copy.allGenders}
                          className="rounded-lg border border-border bg-surface-secondary/60 px-2 py-2 text-xs text-text outline-none focus:border-accent"
                        >
                          <option value="all">{copy.allGenders}</option>
                          <option value="female">{copy.female}</option>
                          <option value="male">{copy.male}</option>
                        </select>
                      </div>
                      <div
                        className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-4"
                        role="radiogroup"
                        aria-label={copy.voice}
                      >
                        {visibleVoices.map((voice) => {
                          const selected = voice.id === kokoroSpeakerId
                          const gender = voice.gender === 'female' ? copy.female : copy.male
                          const voiceLabel = getKokoroVoiceLabel(voice, chinese)
                          const region = REGION_LABELS[chinese ? 'zh' : 'en'][voice.region]
                          return (
                            <button
                              key={voice.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${voiceLabel} · ${region} · ${gender}`}
                              onClick={() => setKokoroSpeakerId(voice.id)}
                              className={`relative rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                selected
                                  ? 'border-accent bg-accent-subtle text-accent'
                                  : 'border-border bg-surface-secondary/60 text-text hover:border-accent/45 hover:bg-surface-secondary'
                              }`}
                            >
                              {selected && (
                                <Check
                                  size={12}
                                  className="absolute right-2 top-2"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="block text-sm font-semibold">
                                {voiceLabel}
                              </span>
                              <span className="mt-0.5 block text-[10px] opacity-65">
                                {region} · {gender} · ID {voice.id}
                              </span>
                              {voice.region !== 'chinese' && (
                                <span className="mt-1 block text-[9px] opacity-50">
                                  {copy.experimental}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  )}

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
                        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
                        onClick={() => void install(kind)}
                      >
                        <Download size={14} /> {copy.download}
                      </button>
                    )}
                    {downloading && (
                      <button
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-tertiary px-3 py-2 text-xs font-semibold"
                        onClick={() => void cancelVoiceAssetDownload()}
                      >
                        <X size={14} /> {copy.cancel}
                      </button>
                    )}
                    {asset?.installed && kind === 'tts' && (
                      <button
                        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
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
                            : `${copy.test} · ${getKokoroVoiceLabel(selectedVoice, chinese)}`}
                      </button>
                    )}
                    {asset?.installed && (
                      <button
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10"
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
          className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          {error}
        </div>
      )}
      <div
        className={`mt-4 rounded-lg border px-4 py-3 text-sm font-semibold ${
          realtimeReady
            ? 'border-green-500/20 bg-green-500/10 text-green-600'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-600'
        }`}
      >
        {realtimeReady ? copy.ready : copy.notReady}
      </div>
    </div>
  )
}
