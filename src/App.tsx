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
import { Kilo } from './utils'
import { useMCPStore } from './stores/mcpStore'
import { useSkillStore } from './stores/skillStore'
import { SkillDropZone } from './components/skills'

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
    async function initKiloUrl() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const url = await invoke<string>('get_kilo_url')
        if (url) {
          Kilo.setBaseUrl(url)
          // Sync MCP configs from Kilo if it's running
          useMCPStore.getState().refreshAllServers().catch(() => {})
        }
      } catch {
        // Not running inside Tauri — use default URL (Vite dev mode)
      }
    }
    initKiloUrl()

    // Auto-discover skills (scans configured paths for SKILL.md files)
    // This works regardless of Kilo being online (uses Tauri Rust commands)
    useSkillStore.getState().refreshSkills().catch(() => {})

    const projectDir = import.meta.env.VITE_KILO_PROJECT_DIR || null
    if (projectDir) {
      Kilo.setProjectDir(projectDir)
    }
  }, [])

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-bg relative">
      <TitleBar />
      
      {/* Global Unified Background - Provides the "How can I help" vibe everywhere */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Main Center Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-accent/5 rounded-full blur-[160px] opacity-60" />
        {/* Top Left Accent */}
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-accent/8 blur-[140px]" />
        {/* Bottom Right Accent */}
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
