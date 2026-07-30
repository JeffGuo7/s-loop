import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Download, Mic, Square, Trash2, X } from 'lucide-react'
import i18n from '../../i18n'
import { VoiceRuntimeSettings } from './VoiceRuntimeSettings'
import {
  cancelDictation,
  cancelDictationModelDownload,
  deleteDictationModel,
  downloadDictationModel,
  getDictationLevel,
  getDictationStatus,
  isTauriRuntime,
  listenDictationDownloadProgress,
  markDictationTestPassed,
  publishVoiceInputStatus,
  startDictation,
  stopDictation,
  verifyDictationModel,
  type DictationDownloadProgress,
  type VoiceInputStatus,
} from '../../utils/voiceInput'

const copy = {
  en: {
    title: 'Local voice input',
    description: 'Speech is recorded and transcribed on this device. Audio is never uploaded or saved.',
    browser: 'Voice input is available in the installed desktop app.',
    compatible: 'Compatible',
    unsupported: 'Not compatible',
    model: 'Multilingual speech model',
    download: 'Download model',
    downloading: 'Downloading',
    cancel: 'Cancel',
    verify: 'Verify / repair',
    remove: 'Delete model',
    test: 'Microphone test',
    testHint: 'Record a short sentence. The transcript stays in this settings page.',
    startTest: 'Start test',
    stopTest: 'Stop and transcribe',
    testing: 'Transcribing…',
    ready: 'Voice input is ready',
    notReady: 'Complete the model download and microphone test before using the chat microphone.',
    transcript: 'Test transcript',
    empty: 'No speech was recognized. Try speaking for a little longer.',
  },
  zh: {
    title: '本地语音输入',
    description: '语音只在本机录制和转写，不会上传，也不会保存音频文件。',
    browser: '语音输入仅在安装后的桌面应用中可用。',
    compatible: '设备兼容',
    unsupported: '设备不兼容',
    model: '多语言语音模型',
    download: '下载模型',
    downloading: '正在下载',
    cancel: '取消',
    verify: '校验 / 修复',
    remove: '删除模型',
    test: '麦克风测试',
    testHint: '录制一句短语，转写结果只显示在当前设置页。',
    startTest: '开始测试',
    stopTest: '停止并转写',
    testing: '正在转写…',
    ready: '语音输入已就绪',
    notReady: '下载并校验模型、完成麦克风测试后，聊天输入框才会启用语音按钮。',
    transcript: '测试结果',
    empty: '没有识别到语音，请说得更久一些再试。',
  },
}

const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`

export function VoiceInputSettings() {
  const text = i18n.resolvedLanguage?.startsWith('zh') ? copy.zh : copy.en
  const [status, setStatus] = useState<VoiceInputStatus | null>(null)
  const [progress, setProgress] = useState<DictationDownloadProgress | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [level, setLevel] = useState(0)

  const refresh = async () => {
    const next = await getDictationStatus()
    setStatus(next)
    publishVoiceInputStatus(next)
    return next
  }

  useEffect(() => {
    if (!isTauriRuntime()) return
    void refresh().catch((reason) => setError(String(reason)))
    let unlisten: (() => void) | undefined
    void listenDictationDownloadProgress(setProgress).then((dispose) => {
      unlisten = dispose
    })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!status?.recording) {
      setLevel(0)
      return
    }
    const timer = window.setInterval(() => {
      void getDictationLevel().then(setLevel).catch(() => setLevel(0))
    }, 100)
    return () => window.clearInterval(timer)
  }, [status?.recording])

  useEffect(() => {
    if (!status?.recording) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void cancelDictation().finally(() => void refresh())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status?.recording])

  const percent = useMemo(() => {
    if (!progress?.totalBytes) return 0
    return Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
  }, [progress])

  const run = async (name: string, operation: () => Promise<VoiceInputStatus>) => {
    setBusy(name)
    setError(null)
    try {
      const next = await operation()
      setStatus(next)
      publishVoiceInputStatus(next)
    } catch (reason) {
      setError(String(reason))
      await refresh().catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }

  const toggleTest = async () => {
    setError(null)
    if (status?.recording) {
      setBusy('transcribing')
      try {
        const result = await stopDictation()
        const cleaned = result.trim()
        setTranscript(cleaned || text.empty)
        if (cleaned) {
          const next = await markDictationTestPassed()
          setStatus(next)
          publishVoiceInputStatus(next)
        }
      } catch (reason) {
        setError(String(reason))
        await refresh().catch(() => undefined)
      } finally {
        setBusy(null)
      }
      return
    }
    setBusy('recording')
    try {
      setTranscript('')
      const next = await startDictation()
      setStatus(next)
    } catch (reason) {
      setError(String(reason))
      await refresh().catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }

  if (!isTauriRuntime()) {
    return <div className="p-8 rounded-[24px] border border-border bg-surface-secondary text-text-secondary">{text.browser}</div>
  }

  return (
    <div className="p-10 space-y-6">
      <div className="rounded-[24px] border border-border-light bg-surface-secondary/60 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-accent-subtle text-accent"><Mic size={22} /></div>
          <div className="flex-1">
            <h4 className="text-lg font-bold text-text">{text.title}</h4>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{text.description}</p>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold">
              {status?.supported ? <CheckCircle size={15} className="text-green-500" /> : <AlertTriangle size={15} className="text-amber-500" />}
              <span>{status?.supported ? text.compatible : text.unsupported}</span>
              <span className="text-text-tertiary">· {status?.deviceSummary || '—'}</span>
            </div>
            {status?.compatibilityReason && <p className="mt-3 text-sm text-amber-600">{status.compatibilityReason}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-border-light bg-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-text">{text.model}</h4>
            <p className="mt-1 text-xs text-text-tertiary">
              {status?.modelName || 'Whisper Base Multilingual'} · {formatBytes(status?.modelBytes || 0)}
            </p>
          </div>
          {status?.modelVerified && <CheckCircle size={20} className="text-green-500" />}
        </div>

        {(busy === 'download' || status?.downloadInProgress) && (
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs text-text-secondary">
              <span>{text.downloading}</span><span>{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
              <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {!status?.modelVerified && !status?.downloadInProgress && (
            <button className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold flex items-center gap-2" disabled={!!busy || !status?.supported} onClick={() => void run('download', downloadDictationModel)}>
              <Download size={16} /> {text.download}
            </button>
          )}
          {(busy === 'download' || status?.downloadInProgress) && (
            <button className="px-4 py-2 rounded-xl bg-surface-secondary text-sm font-bold flex items-center gap-2" onClick={() => void cancelDictationModelDownload()}>
              <X size={16} /> {text.cancel}
            </button>
          )}
          {status?.modelInstalled && (
            <button className="px-4 py-2 rounded-xl bg-surface-secondary text-sm font-bold" disabled={!!busy} onClick={() => void run('verify', verifyDictationModel)}>
              {text.verify}
            </button>
          )}
          {status?.modelInstalled && (
            <button className="px-4 py-2 rounded-xl text-red-500 hover:bg-red-500/10 text-sm font-bold flex items-center gap-2" disabled={!!busy} onClick={() => void run('delete', deleteDictationModel)}>
              <Trash2 size={15} /> {text.remove}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-border-light bg-surface p-6">
        <h4 className="font-bold text-text">{text.test}</h4>
        <p className="mt-1 text-sm text-text-secondary">{text.testHint}</p>
        {status?.recording && (
          <div className="mt-5 flex items-center gap-1 h-10" aria-label="Microphone input level">
            {Array.from({ length: 16 }, (_, index) => (
              <span key={index} className="w-1.5 rounded-full bg-accent transition-all" style={{ height: `${6 + Math.max(0.08, level) * (10 + (index % 5) * 5)}px` }} />
            ))}
          </div>
        )}
        {transcript && (
          <div className="mt-4 rounded-2xl bg-surface-secondary p-4 text-sm text-text">
            <span className="block mb-1 text-xs font-bold text-text-tertiary">{text.transcript}</span>
            {transcript}
          </div>
        )}
        <button
          className={`mt-5 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${status?.recording ? 'bg-red-500 text-white' : 'bg-accent text-white'}`}
          disabled={!!busy || !status?.modelVerified || !status?.supported}
          onClick={() => void toggleTest()}
        >
          {status?.recording ? <Square size={15} fill="currentColor" /> : <Mic size={16} />}
          {busy === 'transcribing' ? text.testing : status?.recording ? text.stopTest : text.startTest}
        </button>
      </div>

      {error && <div role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
      <div className={`rounded-2xl px-5 py-4 text-sm font-bold ${status?.modelVerified && status?.testPassed ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}>
        {status?.modelVerified && status?.testPassed ? text.ready : text.notReady}
      </div>
      <VoiceRuntimeSettings />
    </div>
  )
}
