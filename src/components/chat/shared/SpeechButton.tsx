import { useEffect, useState } from 'react'
import { LoaderCircle, Square, Volume2 } from 'lucide-react'
import { useAppStore } from '../../../stores/appStore'
import { openVoiceInputSettings } from '../../../utils/voiceInput'
import { toSpeakableText } from '../../../utils/voiceConversation'
import {
  getVoiceRuntimeStatus,
  listenSpeechPlayback,
  speakText,
  stopSpeaking,
  voiceAsset,
  type SpeechPlaybackEvent,
} from '../../../utils/voiceRuntime'

interface SpeechButtonProps {
  text: string
  label: string
}

export function SpeechButton({ text, label }: SpeechButtonProps) {
  const kokoroSpeakerId = useAppStore((state) => state.kokoroSpeakerId)
  const [installed, setInstalled] = useState(false)
  const [requestId, setRequestId] = useState<number | null>(null)
  const [event, setEvent] = useState<SpeechPlaybackEvent | null>(null)

  useEffect(() => {
    void getVoiceRuntimeStatus()
      .then((status) => setInstalled(!!voiceAsset(status, 'tts')?.installed))
      .catch(() => setInstalled(false))
    let dispose: (() => void) | undefined
    void listenSpeechPlayback((next) => {
      if (next.requestId !== requestId && requestId !== null) return
      setEvent(next)
      if (next.state === 'idle' || next.state === 'error') {
        setRequestId(null)
      }
    }).then((unlisten) => {
      dispose = unlisten
    })
    return () => dispose?.()
  }, [requestId])

  const active =
    requestId !== null &&
    (event?.state === 'loading' || event?.state === 'speaking')

  const toggle = async () => {
    if (!installed) {
      openVoiceInputSettings()
      return
    }
    if (active) {
      await stopSpeaking()
      setRequestId(null)
      return
    }
    const speakableText = toSpeakableText(text)
    if (!speakableText) return
    const nextRequest = await speakText(speakableText, 1, kokoroSpeakerId)
    setRequestId(nextRequest)
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text"
      title={
        installed
          ? active
            ? 'Stop speech'
            : label
          : 'Configure local text-to-speech'
      }
      aria-label={active ? 'Stop speech' : label}
    >
      {event?.state === 'loading' && requestId !== null ? (
        <LoaderCircle size={13} className="animate-spin" />
      ) : active ? (
        <Square size={12} fill="currentColor" />
      ) : (
        <Volume2 size={13} />
      )}
      <span>{active ? 'Stop' : label}</span>
    </button>
  )
}
