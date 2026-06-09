import { useState, useEffect, useCallback } from 'react'
import { Sidebar, TitleBar } from './components/layout'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { TasksPage } from './components/tasks'
import { PlatformCenter } from './components/platforms'
import { useAppStore, usePetStore } from './stores'
import { useTaskScheduler } from './hooks'
import { WorkspacePanel } from './components/workspace'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { SkillDropZone } from './components/skills'
import { initDatabase } from './utils/database'
import { getAllSessions, createSession as dbCreateSession, saveMessage as dbSaveMessage } from './utils/database'

export type Page = 'chat' | 'tasks' | 'platforms'

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function App() {
  const { theme, sidebarCollapsed, toggleSidebar } = useAppStore()
  const [currentPage, setCurrentPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)

  useTaskScheduler()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    useMCPStore.getState().refreshAllServers().catch(() => {})
    useSkillStore.getState().refreshSkills().catch(() => {})

    initDatabase().then(async () => {
      const storedState = localStorage.getItem('snotra-app-storage')
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
        } catch { /* migration failed, continue with empty DB */ }
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
          url: '/pet.html',
          title: 'Pet',
          width: 200,
          height: 200,
          decorations: false,
          transparent: true,
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

      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-accent/5 rounded-full blur-[160px] opacity-60" />
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-accent/8 blur-[140px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[35%] h-[35%] rounded-full bg-accent/6 blur-[120px]" />
      </div>

      <Sidebar
        onSettingsOpen={() => setShowSettings(true)}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onPetToggle={handlePetToggle}
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
        </div>
      </main>

      <WorkspacePanel />

      <SkillDropZone />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
