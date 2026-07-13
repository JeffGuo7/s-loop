import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Sidebar, TitleBar } from './components/layout'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { TasksPage } from './components/tasks'
import { PlatformCenter } from './components/platforms'
import { PetPage } from './components/pet'
import { GoalPage } from './components/goal/GoalPage'
import { ExtensionsPage } from './components/extensions/ExtensionsPage'
import { useAppStore, usePetStore } from './stores'
import { useTaskScheduler, useTelegramChatSync } from './hooks'
import { WorkspacePanel } from './components/workspace'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { useAgentStore } from './stores/agentStore'
import { useWebSearchStore } from './stores/websearchStore'
import { SkillDropZone } from './components/skills'
import { initDatabase } from './utils/database'
import { getAllSessions, createSession as dbCreateSession, saveMessage as dbSaveMessage } from './utils/database'
import { setBaseUrl, syncRuntimeConfig } from './utils/piClient'
import { buildAgentRuntimeConfig } from './utils/agentRuntime'
import { getActiveTokens } from './themes'

export type Page = 'chat' | 'tasks' | 'platforms' | 'pet' | 'goal' | 'extensions'

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const APP_STORAGE_KEY = 'snotra-storage'

function App() {
  const { theme, colorScheme, sidebarCollapsed, toggleSidebar, activeProvider, providerConfigs, workspaceDir } = useAppStore()
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const skills = useSkillStore((s) => s.skills)
  const [currentPage, setCurrentPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)

  useTaskScheduler()
  useTelegramChatSync()

  useEffect(() => {
    const tid = setTimeout(async () => {
      if (!inTauri) return
      const { pet, petWindowVisible } = usePetStore.getState()
      if (pet && petWindowVisible) {
        try {
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
          const existing = await WebviewWindow.getByLabel('pet')
          if (!existing) {
            const win = new WebviewWindow('pet', {
              url: '/pet/index.html',
              title: 'Pet',
              width: 200,
              height: 200,
              decorations: false,
              transparent: true,
              shadow: false,
              alwaysOnTop: true,
              skipTaskbar: true,
              visible: true,
              resizable: false,
              focus: false,
            })
            win.once('tauri://close-requested', () => {
              usePetStore.getState().setPetWindowVisible(false)
            })
          }
        } catch { /* window already exists or not in tauri */ }
      }
    }, 800)
    return () => clearTimeout(tid)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Apply color scheme CSS variables
  useEffect(() => {
    const tokens = getActiveTokens(colorScheme || 'terracotta', theme)
    const root = document.documentElement
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value)
    }
  }, [colorScheme, theme])

  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (!inTauri) return

    let cancelled = false

    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const url = await invoke<string>('start_server')
        if (!cancelled && url) {
          setBaseUrl(url)
          setServerError(null)
        }
      } catch (err) {
        const msg = String(err)
        console.error('[app] pi-server start failed:', msg)
        if (!cancelled) setServerError(msg)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const config = providerConfigs[activeProvider]
    if (!config?.model) return
    syncRuntimeConfig({
      providerID: activeProvider,
      modelID: config.model,
      apiKey: config.apiKey,
      workspaceDir: workspaceDir ?? undefined,
      providerConfig: {
        supportsVision: config.supportsVision === true,
      },
      webSearchConfig: useWebSearchStore.getState().getActiveConfig() as unknown as Record<string, unknown>,
      ...buildAgentRuntimeConfig(),
    }).catch((err) => {
      console.warn('[app] failed to sync runtime config:', err)
    })
  }, [activeProvider, providerConfigs, workspaceDir, activeAgentId, agents, skills])

  useEffect(() => {
    useMCPStore.getState().refreshAllServers().catch(() => {})
    useSkillStore.getState().refreshSkills().catch(() => {})

    initDatabase().then(async () => {
      const storedState = localStorage.getItem(APP_STORAGE_KEY)
      if (storedState) {
        try {
          const parsed = JSON.parse(storedState)
          const { sessions, sessionMessages } = parsed?.state || {}
          if (sessions?.length > 0) {
            const existing = await getAllSessions()
            if (existing.length === 0) {
              for (const s of sessions) {
                await dbCreateSession(s.id, s.title || '', s.model || '')
              }
              if (sessionMessages) {
                for (const [sessionId, msgs] of Object.entries(sessionMessages)) {
                  if (Array.isArray(msgs)) {
                    for (const msg of msgs as any[]) {
                      await dbSaveMessage(
                        msg.info?.id || msg.id,
                        sessionId,
                        msg.info?.role || 'assistant',
                        msg.parts || [],
                        msg.info || {}
                      )
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('[app] failed to migrate persisted sessions into SQLite:', err)
        }
      }

      await useAppStore.getState().loadFromDb()

      const state = useAppStore.getState()
      if (state.activeSessionId) {
        await state.loadMessages(state.activeSessionId)
      }
    }).catch(console.warn)
  }, [])

  const handlePetToggle = useCallback(async () => {
    if (!inTauri) return

    const store = usePetStore.getState()
    const visible = !store.petWindowVisible
    store.setPetWindowVisible(visible)

    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const existing = await WebviewWindow.getByLabel('pet')

      if (existing) {
        if (visible) {
          await existing.show()
          await existing.setFocus()
        } else {
          await existing.hide()
        }
        return
      }

      if (visible) {
        const win = new WebviewWindow('pet', {
          url: '/pet/index.html',
          title: 'Pet',
          width: 200,
          height: 200,
          decorations: false,
          transparent: true,
          shadow: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          visible: true,
          resizable: false,
          focus: false,
        })
        await win.once('tauri://created', () => {
          usePetStore.getState().setPetWindowVisible(true)
          console.log('[pet] window created')
        })
        await win.once('tauri://error', (e: unknown) => {
          console.error('[pet] window error:', e)
          usePetStore.getState().setPetWindowVisible(false)
        })
        await win.once('tauri://close-requested', () => {
          usePetStore.getState().setPetWindowVisible(false)
          console.log('[pet] window closed')
        })
      }
    } catch (err) {
      console.error('[pet] toggle failed:', err)
    }
  }, [])

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-bg relative">
      <TitleBar />

      {serverError && (
        <div className="fixed top-12 left-0 right-0 z-50 mx-4">
          <div className="max-w-2xl mx-auto rounded-2xl border-2 border-red-500/30 bg-red-500/10 backdrop-blur-xl px-6 py-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-black text-red-400 uppercase tracking-wider">Server Startup Failed</p>
                <p className="mt-1 text-[11px] text-red-300/80 font-mono break-all leading-relaxed">{serverError}</p>
                <p className="mt-2 text-[10px] text-text-tertiary">
                  Make sure Node.js is installed and the pi-server directory exists next to the app executable.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-accent/5 rounded-full blur-[160px] opacity-60" />
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-accent/8 blur-[140px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[35%] h-[35%] rounded-full bg-accent/6 blur-[120px]" />
      </div>

      <Sidebar
        onSettingsOpen={() => setShowSettings(true)}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        className="pt-10"
      />

      <main className="flex-1 min-w-0 h-full relative z-10 flex flex-col items-center justify-center pt-10">
        <div className="w-full h-full flex flex-col items-center justify-center bg-transparent">
          {currentPage === 'chat' && <ChatView />}
          {currentPage === 'tasks' && (
            <div className="w-full max-w-(--chat-max-width) mx-auto h-full flex flex-col">
              <TasksPage />
            </div>
          )}
          {currentPage === 'platforms' && (
            <div className="w-full h-full flex flex-col">
              <PlatformCenter />
            </div>
          )}
          {currentPage === 'pet' && <PetPage onToggleWindow={handlePetToggle} />}
          {currentPage === 'goal' && (
            <div className="w-full h-full flex flex-col">
              <GoalPage />
            </div>
          )}
          {currentPage === 'extensions' && (
            <div className="w-full h-full flex flex-col">
              <ExtensionsPage />
            </div>
          )}
        </div>
      </main>

      <WorkspacePanel />

      <SkillDropZone />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
