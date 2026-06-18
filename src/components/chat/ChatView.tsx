import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, useAgentStore, useWebSearchStore, usePetStore } from '../../stores'
import { useSkillStore } from '../../stores/skillStore'
import { useMCPStore } from '../../stores/mcpStore'
import { Cpu, Sparkles, Paperclip } from 'lucide-react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import * as Pi from '../../utils/piClient'
import type { KiloMessage } from '../../types'
import { motion, AnimatePresence } from 'framer-motion'

const EMPTY_MESSAGES: never[] = []
const EMPTY_STREAMING = null

export function ChatView() {
  const { t } = useTranslation()
  const {
    activeSessionId,
    sessions,
    providerConfigs,
    activeProvider,
    workspaceDir,
    startStreaming,
    appendStreamingDelta,
    finishStreaming,
    commitStreamingMessage,
    addMessage,
    updateSessionTitle,
  } = useAppStore()

  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragTargetZone, setDragTargetZone] = useState<'message' | 'input'>('message')
  const containerRef = useRef<HTMLDivElement>(null)
  const streamUnsubsRef = useRef(new Map<string, () => void>())

  const subscribeStream = useCallback((piSessionId: string, sid: string) => {
    streamUnsubsRef.current.get(piSessionId)?.()
    let unsubscribe = () => {}
    unsubscribe = Pi.subscribeStream(piSessionId, {
      onText: (partPid, delta) => {
        if (useAppStore.getState().streamingMessage[sid]) {
          useAppStore.getState().appendStreamingDelta(sid, partPid, delta)
        }
      },
      onThinking: (delta) => {
        const sm = useAppStore.getState().streamingMessage[sid]
        if (!sm) return
        const parts = [...sm.parts]
        const last = parts[parts.length - 1]
        if (last?.type === 'reasoning') {
          useAppStore.getState().appendStreamingDelta(sid, last.id, delta)
        } else {
          const rid = `thinking_${Date.now()}`
          useAppStore.getState().updateStreamingPart(sid, rid, {
            id: rid, type: 'reasoning', text: delta,
            sessionID: sid, messageID: sm.messageID,
          } as any)
        }
      },
      onToolCall: (id, name, args) => {
        console.log('[S-Loop] Tool call:', name, id)
        usePetStore.getState().onWorking()
        const sm = useAppStore.getState().streamingMessage[sid]
        if (!sm) return
        useAppStore.getState().updateStreamingPart(sid, id, {
          id, type: 'tool', name, args, callID: id,
          tool: name, state: { status: 'running' as const },
          sessionID: sid, messageID: sm.messageID,
        } as any)
      },
      onToolResult: (id, name, result) => {
        const sm = useAppStore.getState().streamingMessage[sid]
        if (!sm) return
        useAppStore.getState().updateStreamingPart(sid, id, {
          id, type: 'tool', name, tool: name, callID: id,
          state: { status: 'completed' as const, output: JSON.stringify((result as any)?.content?.[0]?.text || result) },
          sessionID: sid, messageID: sm.messageID,
        } as any)
      },
      onDone: () => {
        unsubscribe()
        streamUnsubsRef.current.delete(piSessionId)
      },
    })
    streamUnsubsRef.current.set(piSessionId, unsubscribe)
  }, [])

  const session = sessions.find((s) => s.id === activeSessionId)
  const sessionMessages = useAppStore((state) => state.sessionMessages)
  const messages = activeSessionId ? sessionMessages[activeSessionId] || EMPTY_MESSAGES : EMPTY_MESSAGES
  const isEmpty = messages.length === 0

  const handleSubmit = useCallback(
    async (content: string) => {
      const sid = useAppStore.getState().activeSessionId
      if (!content || !sid) return
      setError(null)

      const providerConfig = activeProvider ? providerConfigs[activeProvider] : null
      if (!providerConfig) { setError(t('chat.errors.noProvider')); return }
      if (!providerConfig.apiKey) { setError(t('chat.errors.noApiKey')); return }

      const model = providerConfig?.model
        ? { providerID: activeProvider!, modelID: providerConfig.model }
        : undefined
      if (!model) { setError(t('chat.errors.noModel')); return }

      // Add user message
      const uid = Math.random().toString(36).substring(2, 15)
      addMessage(sid, {
        info: { id: uid, sessionID: sid, role: 'user', time: { created: Date.now() } },
        parts: [{ id: `${uid}-0`, type: 'text', text: content, sessionID: sid, messageID: uid }],
      })

      if (session?.title === 'New Chat') {
        updateSessionTitle(sid, content.slice(0, 40) + (content.length > 40 ? '...' : ''))
      }

      // Create or reuse Pi session
      let pid = (useAppStore.getState().sessions.find(s => s.id === sid) as any)?.piId ?? null
      if (!pid) {
        try {
          const ks = await Pi.createSession()
          pid = ks.id
          useAppStore.setState((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sid ? { ...s, piId: pid } : s,
            ),
          }))
        } catch {
          setError(t('chat.errors.sessionFailed'))
          usePetStore.getState().onError()
          return
        }
      }

      // Subscribe for streaming visual feedback
      subscribeStream(pid, sid)

      // Build context
      const agentStore = useAgentStore.getState()
      const activeAgent = agentStore.activeAgentId
        ? agentStore.agents.find((a) => a.id === agentStore.activeAgentId) : null

      const skillStore = useSkillStore.getState()
      const enabledSkills = activeAgent && activeAgent.skills.length > 0
        ? activeAgent.skills.map(n => skillStore.skills.find(s => s.name === n)).filter((s): s is NonNullable<typeof s> => s !== undefined && s.enabled)
        : skillStore.skills.filter(s => s.enabled)

      const mcpStore = useMCPStore.getState()
      const connectedMCPTools: { serverName: string; toolName: string }[] = []
      if (activeAgent && activeAgent.mcpTools.length > 0) {
        for (const mcpRef of activeAgent.mcpTools)
          connectedMCPTools.push({ serverName: mcpRef.serverName, toolName: mcpRef.toolName })
      } else {
        for (const [name, status] of Object.entries(mcpStore.serverStatuses)) {
          if (status.status === 'connected' && status.tools) {
            for (const tool of status.tools)
              connectedMCPTools.push({ serverName: name, toolName: tool.name })
          }
        }
      }

      let enrichedContent = content
      const blocks: string[] = []

      if (enabledSkills.length > 0) {
        const skillBlocks = enabledSkills.map(s =>
          s.content
            ? `<skill name="${s.name}">\n${s.description ? `Description: ${s.description}\n` : ''}${s.content}\n</skill>`
            : `<skill name="${s.name}">\n${s.description || ''}\n</skill>`
        )
        blocks.push('## Active Skills\nThe following skills are activated and their instructions should be followed:\n' + skillBlocks.join('\n\n'))
      }

      if (connectedMCPTools.length > 0) {
        const listings = connectedMCPTools.map(({ serverName, toolName }) => {
          const st = mcpStore.serverStatuses[serverName]
          const tool = st?.status === 'connected' ? st.tools?.find(t => t.name === toolName) : undefined
          return tool ? `- \`${serverName}/${tool.name}\`: ${tool.description || 'No description'}` : `- \`${serverName}/${toolName}\``
        })
        blocks.push('## Available MCP Tools\nThe following MCP tools are available for use:\n' + listings.join('\n'))
      }

      if (activeAgent?.instructions) blocks.unshift(`## System Instructions\n${activeAgent.instructions}`)

      if (blocks.length > 0) {
        const header = activeAgent ? `[Agent: ${activeAgent.name}]` : '[Global Context]'
        enrichedContent = `${header}\n---\n${blocks.join('\n\n')}\n---\n\n${content}`
      }

      const effectiveModel = activeAgent?.model
        ? { providerID: activeProvider!, modelID: activeAgent.model }
        : model

      startStreaming(sid, 'pending-' + Date.now())

      usePetStore.getState().onThinking()

      const result = await Pi.prompt(pid!, enrichedContent, {
        systemPrompt: activeAgent?.instructions || undefined,
        providerID: effectiveModel?.providerID,
        modelID: effectiveModel?.modelID,
        thinkingLevel: 'medium',
        apiKey: providerConfig?.apiKey,
        workspaceDir: workspaceDir ?? undefined,
        webSearchConfig: useWebSearchStore.getState().getActiveConfig(),
      })

      if (result.error) {
        setError(result.error)
        finishStreaming(sid)
        usePetStore.getState().onError()
        return
      }

      const msgID = `pi-msg-${Date.now()}`
      const sm = useAppStore.getState().streamingMessage[sid]
      const accumulatedParts = sm?.parts || []
      const textPart = accumulatedParts.find(p => p.type === 'text')
      if (textPart && 'text' in textPart) {
        (textPart as any).text = result.text
      }
      // If no text part was created during streaming, ensure one exists
      // (happens when model only emits thinking_delta but no text_delta)
      if (!accumulatedParts.find(p => p.type === 'text')) {
        // Use result text first, then fallback to last reasoning text
        const fallbackText = result.text
          || accumulatedParts.filter(p => p.type === 'reasoning').pop()?.text
          || ''
        accumulatedParts.push({
          id: `pi-text-${Date.now()}`,
          type: 'text', text: fallbackText,
          sessionID: sid, messageID: msgID,
        } as any)
      }

      const completedMessage: KiloMessage = {
        info: { id: msgID, sessionID: sid, role: 'assistant', time: { created: Date.now() } },
        parts: accumulatedParts,
      }

      commitStreamingMessage(sid, completedMessage)
      usePetStore.getState().onResponded()
    },
    [activeSessionId, activeProvider, providerConfigs, session, t, startStreaming, finishStreaming, commitStreamingMessage, addMessage, updateSessionTitle, appendStreamingDelta, subscribeStream],
  )

  const activePiSessionId = activeSessionId
    ? (sessions.find((s) => s.id === activeSessionId) as any)?.piId ?? ''
    : ''

  const abort = useCallback(() => {
    if (activePiSessionId) {
      Pi.abortSession(activePiSessionId)
      streamUnsubsRef.current.get(activePiSessionId)?.()
      streamUnsubsRef.current.delete(activePiSessionId)
    }
    if (activeSessionId) finishStreaming(activeSessionId)
    usePetStore.getState().onResponded()
  }, [activePiSessionId, activeSessionId, finishStreaming])

  // ── File/folder drag into message area ──

  async function listFilesRecursive(dirPath: string, maxFiles = 30, depth = 0): Promise<string[]> {
    if (depth > 5 || maxFiles <= 0) return []
    const { invoke } = await import('@tauri-apps/api/core')
    const entries = await invoke<any[]>('list_directory', { path: dirPath })
    const skipDirs = new Set(['node_modules', '.git', 'target', '__pycache__', 'dist', '.next', '.cache'])
    let results: string[] = []
    for (const entry of entries) {
      if (entry.is_dir) {
        if (skipDirs.has(entry.name)) continue
        const sub = await listFilesRecursive(entry.path, maxFiles - results.length, depth + 1)
        results = results.concat(sub)
      } else {
        results.push(entry.path)
        if (results.length >= maxFiles) break
      }
    }
    return results
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const relativeY = e.clientY - rect.top
      const inputZoneStart = rect.height * 0.6
      setDragTargetZone(relativeY > inputZoneStart ? 'input' : 'message')
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const fileData = e.dataTransfer.getData('application/x-s-loop-file')
    if (!fileData) return

    const { path, name, isDir } = JSON.parse(fileData)

    let content = ''
    if (isDir) {
      try {
        const files = await listFilesRecursive(path)
        const summary = files.length > 0
          ? files.map(f => `- ${f}`).join('\n')
          : '(empty folder)'
        content = `[Folder: ${name}](${path})\n\n\`\`\`\n${summary}\n\`\`\``
      } catch {
        content = `[Folder: ${name}](${path})`
      }
    } else {
      content = `[File: ${name}](${path})`
    }

    if (!useAppStore.getState().activeSessionId) {
      useAppStore.getState().createSession()
    }

    handleSubmit(content)
  }, [handleSubmit])

  const streamingMessages = useAppStore((state) => state.streamingMessage)
  const streamingMessage = activeSessionId ? streamingMessages[activeSessionId] : EMPTY_STREAMING
  const isStreaming = streamingMessage?.isStreaming ?? false

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-transparent relative selection:bg-accent/10">
        <div className="relative z-10 w-full flex flex-col items-center justify-center text-center px-4 sm:px-8 max-w-4xl mx-auto h-full">
          <div className="mb-4 sm:mb-8 shrink-0">
            <div className="relative group scale-75 sm:scale-90 transition-transform duration-700">
              <div className="absolute inset-0 bg-accent/10 blur-[40px] group-hover:bg-accent/20 transition-all duration-1000 rounded-full scale-125" />
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-[32%_68%_55%_45%/45%_35%_65%_55%] bg-white/95 dark:bg-white/5 border border-white/40 dark:border-white/10 flex items-center justify-center shadow-2xl backdrop-blur-3xl animate-liquid overflow-hidden">
                <Cpu size={32} className="sm:hidden text-accent drop-shadow-[0_4px_16px_rgba(var(--color-accent-rgb),0.4)]" />
                <Cpu size={48} className="hidden sm:block text-accent drop-shadow-[0_8px_24px_rgba(var(--color-accent-rgb),0.5)]" />
              </div>
              <motion.div animate={{ y: [0, -8, 0], x: [0, 4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} className="absolute -top-2 -right-2 sm:-top-4 sm:-right-4 w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-surface border border-border-light shadow-xl flex items-center justify-center text-accent/40 backdrop-blur-xl">
                <Sparkles size={12} className="sm:hidden" />
                <Sparkles size={20} className="hidden sm:block" />
              </motion.div>
            </div>
          </div>
          <div className="space-y-3 sm:space-y-6 mb-6 sm:mb-12 w-full">
            <h2 className="text-3xl sm:text-5xl lg:text-[4.5rem] font-bold tracking-tight text-text leading-tight drop-shadow-sm select-none">
              {t('chat.welcome.title')} <span className="text-accent italic font-serif px-1">{t('chat.welcome.appName')}</span>
            </h2>
            <div className="flex justify-center w-full">
              <p className="text-sm sm:text-base lg:text-lg text-text-tertiary leading-relaxed max-w-lg sm:max-w-xl font-medium tracking-tight opacity-70 text-center">{t('chat.welcome.description')}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-transparent h-full w-full overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && dragTargetZone === 'message' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-[inherit]">
          <div className="w-full h-full mx-4 my-4 rounded-[28px] border-2 border-dashed border-accent/50 bg-accent/5 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
              <Paperclip size={28} className="text-accent" />
            </div>
            <p className="text-lg font-bold text-accent tracking-tight">释放文件/文件夹到此处直接发送</p>
            <p className="text-sm text-text-tertiary font-medium">文件将立即发送给 AI 分析处理</p>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 relative bg-transparent">
        <AnimatePresence mode="wait">
          {isEmpty ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="h-full flex flex-col items-center justify-center px-16 relative pb-48">
              <div className="text-center relative z-10 w-full flex flex-col items-center">
                <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-accent opacity-50 mb-8">{t('chat.welcome.subtitle')}</p>
                <div className="flex justify-center w-full mb-8">
                  <div className="relative group scale-90">
                    <div className="absolute inset-0 bg-accent opacity-30 blur-[80px] group-hover:opacity-50 transition-opacity duration-700 rounded-full scale-110" />
                    <div className="relative w-32 h-32 rounded-[35%_65%_60%_40%/45%_35%_65%_55%] bg-white/95 dark:bg-white/10 border border-white/60 dark:border-white/20 flex items-center justify-center shadow-4xl backdrop-blur-3xl animate-float overflow-hidden">
                      <Cpu size={48} className="text-accent drop-shadow-[0_0_24px_rgba(var(--color-accent-rgb),0.5)]" />
                      <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_3.5s_infinite]" />
                    </div>
                  </div>
                </div>
                <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text leading-none mb-6 drop-shadow-sm text-center">{t('chat.welcome.howCanIHelp')}</h2>
                <p className="text-sm sm:text-base lg:text-lg text-text-tertiary max-w-xl leading-relaxed font-bold opacity-70 text-center">{t('chat.welcome.emptyDesc')}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key={activeSessionId} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="h-full flex flex-col w-full max-w-(--spacing-chat-max) mx-auto relative overflow-hidden">
              <MessageList sessionId={activeSessionId!} />
              {error && (
                <div className="absolute top-8 left-4 right-4 z-20 flex items-center gap-4 p-6 rounded-[24px] bg-red-500/10 text-red-500 text-[14px] font-bold border border-red-500/15 animate-shake shadow-sm backdrop-blur-md">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:opacity-70 text-[10px] font-bold uppercase tracking-[0.2em]">{t('chat.errors.dismiss')}</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
          <div className="bg-linear-to-t from-bg via-bg/95 to-transparent pt-12 pb-2 pointer-events-auto">
            <div className="w-full max-w-(--spacing-chat-max) mx-auto relative px-4">
              <ChatInput onSubmit={handleSubmit} onAbort={abort} isStreaming={isStreaming} placeholder={t('chat.input.placeholder')} />
              <div className="mt-2 pb-2 text-[10px] text-text-tertiary text-center flex items-center justify-center gap-4 opacity-20 hover:opacity-100 transition-all duration-700 scale-90 origin-bottom">
                <div className="flex items-center gap-3 px-5 py-1.5 rounded-full bg-surface-secondary/80 border border-border-light backdrop-blur-3xl shadow-sm hover:shadow-accent/5 hover:border-accent/20 transition-all">
                  <Cpu size={12} className="text-accent/60" />
                  <span className="font-bold uppercase tracking-[0.2em]">{providerConfigs[activeProvider]?.model || t('chat.status.noModel')}</span>
                  <span className="opacity-10 px-1">|</span>
                  <span className="font-bold uppercase tracking-[0.2em]">{activeProvider}</span>
                  {(() => {
                    const agent = useAgentStore.getState().activeAgentId ? useAgentStore.getState().agents.find(a => a.id === useAgentStore.getState().activeAgentId) : null
                    return agent ? <><span className="opacity-10 px-1">|</span><span className="font-bold">{agent.avatar} {agent.name}</span></> : null
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
