import { speakText, stopSpeaking } from './voiceRuntime'
import { useAppStore } from '../stores/appStore'

export type VoiceConversationState =
  | 'inactive'
  | 'starting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'

export interface VoiceConversationSnapshot {
  active: boolean
  state: VoiceConversationState
  error?: string
}

const EVENT_NAME = 's-loop:voice-conversation-changed'
let snapshot: VoiceConversationSnapshot = {
  active: false,
  state: 'inactive',
}

const publish = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<VoiceConversationSnapshot>(EVENT_NAME, {
      detail: { ...snapshot },
    }),
  )
}

export const getVoiceConversation = () => ({ ...snapshot })

export const setVoiceConversation = (
  active: boolean,
  state: VoiceConversationState = active ? 'starting' : 'inactive',
  error?: string,
) => {
  snapshot = { active, state, error }
  publish()
}

export const setVoiceConversationState = (
  state: VoiceConversationState,
  error?: string,
) => {
  snapshot = { ...snapshot, state, error }
  publish()
}

export const listenVoiceConversation = (
  handler: (value: VoiceConversationSnapshot) => void,
) => {
  const listener = (event: Event) => {
    handler((event as CustomEvent<VoiceConversationSnapshot>).detail)
  }
  window.addEventListener(EVENT_NAME, listener)
  return () => window.removeEventListener(EVENT_NAME, listener)
}

export const endVoiceConversation = async () => {
  setVoiceConversation(false)
  await stopSpeaking().catch(() => undefined)
}

export const speakVoiceConversationResponse = async (markdown: string) => {
  if (!snapshot.active) return false
  const text = speechTextFromMarkdown(markdown)
  if (!text) {
    setVoiceConversationState('listening')
    return false
  }
  setVoiceConversationState('speaking')
  try {
    await speakText(text, 1, useAppStore.getState().kokoroSpeakerId)
    return true
  } catch (reason) {
    setVoiceConversation(false, 'error', String(reason))
    return false
  }
}

export const shouldInterruptVoicePlayback = (
  mode: 'dictation' | 'conversation' | null,
  conversation: VoiceConversationSnapshot,
  playbackStartedAt: number,
  cleanedInputLevel: number,
  now = Date.now(),
) =>
  mode === 'conversation' &&
  conversation.active &&
  conversation.state === 'speaking' &&
  now - playbackStartedAt >= 350 &&
  cleanedInputLevel >= 0.025

export function speechTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' 代码块。 ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\n{2,}/g, '。')
    .replace(/\s+/g, ' ')
    .trim()
}
