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
import { setServerConnection, syncRuntimeConfig } from './utils/piClient'
import { buildAgentRuntimeConfig } from './utils/agentRuntime'
import { syncAgentProfileFiles } from './utils/agentProfileFiles'
import { getActiveTokens } from './themes'

export type Page = 'chat' | 'tasks' | 'platforms' | 'pet' | 'goal' | 'extensions'

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const APP_STORAGE_KEY = 'snotra-storage'

function App() {
  const { theme, colorScheme, sidebarCollapsed, toggleSidebar, activeProvider, providerConfigs, workspaceDir, kokoroSpeakerId } = useAppStore()
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const userProfile = useAgentStore((s) => s.userProfile)
  const skills = useSkillStore((s) => s.skills)
  const [currentPage, setCurrentPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState('provider')

  useTaskScheduler()
  useTelegramChatSync()

  useEffect(() => {
    const openSettings = (event: Event) => {
      const requestedTab = (event as CustomEvent<string>).detail
      setSettingsTab(requestedTab || 'provider')
      setShowSettings(true)
    }
    window.addEventListener('s-loop:open-settings', openSettings)
    return () => window.removeEventListener('s-loop:open-settings', openSettings)
  }, [])

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
        const connection = await invoke<{ url: string; apiToken: string }>('start_server')
        if (!cancelled && connection?.url && connection?.apiToken) {
          setServerConnection(connection.url, connection.apiToken)
          setServerError(null)
        }
      } catch (err) {
        const msg = String(err)
        console.error('[app] pi-server start failed:', msg)
        let detail = ''
        try {
          const { invoke: invokeDiagnostics } = await import('@tauri-apps/api/core')
          const diagnostics = await invokeDiagnostics<Record<string, unknown>>('runtime_diagnostics')
          detail = `\n\nRuntime diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`
        } catch (diagnosticError) {
          console.warn('[app] runtime diagnostics failed:', diagnosticError)
        }
        if (!cancelled) setServerError(`${msg}${detail}`)
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
    if (!inTauri) return
    const timer = window.setTimeout(() => {
      syncAgentProfileFiles(
        agents,
        userProfile,
        kokoroSpeakerId,
      ).catch((err) => {
        console.warn('[app] failed to sync agent profile files:', err)
      })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [agents, userProfile, kokoroSpeakerId])

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
          <div className="max-w-2xl mx-auto rounded-xl border border-red-500/25 bg-surface px-5 py-4 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-black text-red-400 uppercase tracking-wider">Server Startup Failed</p>
                <p className="mt-1 text-[11px] text-red-300/80 font-mono break-all leading-relaxed">{serverError}</p>
                <p className="mt-2 text-[10px] text-text-tertiary">
                  The app should use its bundled runtime. Copy this diagnostic message when reporting an installation or startup problem.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        onSettingsOpen={() => {
          setSettingsTab('provider')
          setShowSettings(true)
        }}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        className="pt-[42px]"
      />

      <main className="flex-1 min-w-0 h-full relative z-10 flex flex-col items-center justify-center pt-[42px] border-x border-border-light">
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

      {showSettings && <SettingsModal initialTab={settingsTab} onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
