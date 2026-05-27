import { useState, useEffect } from 'react'
import { Sidebar, TitleBar } from './components/layout'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { PetCompanion, PetHatchModal } from './components/companion'
import { TasksPage } from './components/tasks'
import { TelegramPage } from './components/telegram/index'
import { useAppStore } from './stores'
import { useTaskScheduler } from './hooks'
import { WorkspacePanel } from './components/workspace'
import { OpenCode } from './utils'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { SkillDropZone } from './components/skills'
import { initDatabase } from './utils/database'
import { getAllSessions, createSession as dbCreateSession, saveMessage as dbSaveMessage } from './utils/database'

export type Page = 'chat' | 'tasks' | 'telegram'

function App() {
  const { theme, sidebarCollapsed, toggleSidebar } = useAppStore()
  const [currentPage, setCurrentPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [showHatchModal, setShowHatchModal] = useState(false)

  useTaskScheduler()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    async function initOpenCodeUrl() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const url = await invoke<string>('get_opencode_url')
        if (url) {
          OpenCode.setBaseUrl(url)
          useMCPStore.getState().refreshAllServers().catch(() => {})
        }
      } catch {
        // Not running inside Tauri — use default URL (Vite dev mode)
      }
    }
    initOpenCodeUrl()

    useSkillStore.getState().refreshSkills().catch(() => {})

    const projectDir = import.meta.env.VITE_KILO_PROJECT_DIR || null
    if (projectDir) {
      OpenCode.setProjectDir(projectDir)
    }

    // Initialize SQLite database and migrate localStorage data
    initDatabase().then(async () => {
      // Migrate from localStorage to DB if needed
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

      // Load sessions from DB into store
      await useAppStore.getState().loadFromDb()

      // Load messages for active session if any
      const state = useAppStore.getState()
      if (state.activeSessionId) {
        await state.loadMessages(state.activeSessionId)
      }
    }).catch(console.warn)
  }, [])

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-bg relative">
      <TitleBar />
      
      {/* Global Unified Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-accent/5 rounded-full blur-[160px] opacity-60" />
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-accent/8 blur-[140px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[35%] h-[35%] rounded-full bg-accent/6 blur-[120px]" />
      </div>

      <Sidebar
        onSettingsOpen={() => setShowSettings(true)}
        onPetOpen={() => setShowHatchModal(true)}
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
          {currentPage === 'telegram' && (
            <div className="w-full h-full flex flex-col">
              <TelegramPage />
            </div>
          )}
        </div>
      </main>

      <WorkspacePanel />

      <PetCompanion />
      <SkillDropZone />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHatchModal && <PetHatchModal onClose={() => setShowHatchModal(false)} />}
    </div>
  )
}

export default App
