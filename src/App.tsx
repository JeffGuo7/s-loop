import { useState, useEffect } from 'react'
import { Sidebar } from './components/layout'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { PetCompanion, PetHatchModal } from './components/companion'
import { TasksPage } from './components/tasks'
import { TelegramModal } from './components/telegram'
import { useAppStore } from './stores'
import { useTaskScheduler } from './hooks'
import { WorkspacePanel } from './components/workspace'
import { Kilo } from './utils'

export type Page = 'chat' | 'tasks'

function App() {
  const { theme, sidebarCollapsed, workspaceCollapsed, toggleSidebar } = useAppStore()
  const [currentPage, setCurrentPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [showHatchModal, setShowHatchModal] = useState(false)
  const [showTelegramModal, setShowTelegramModal] = useState(false)

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
        }
      } catch {
        // Not running inside Tauri — use default URL (Vite dev mode)
      }
    }
    initKiloUrl()

    const projectDir = import.meta.env.VITE_KILO_PROJECT_DIR || null
    if (projectDir) {
      Kilo.setProjectDir(projectDir)
    }
  }, [])

  return (
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-(--color-bg)">
      {/* Subtle ambient background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-[0.02] dark:opacity-[0.04]">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-(--color-accent) blur-[150px]" />
        <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-(--color-accent) blur-[120px]" />
      </div>

      <Sidebar
        onSettingsOpen={() => setShowSettings(true)}
        onPetOpen={() => setShowHatchModal(true)}
        onTelegramOpen={() => setShowTelegramModal(true)}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <main 
        className="flex-1 flex min-w-0 relative sidebar-transition"
        style={{ 
          paddingRight: workspaceCollapsed ? 'var(--workspace-panel-collapsed)' : 'var(--workspace-panel-width)' 
        }}
      >
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden items-center">
          <div className="w-full max-w-(--chat-max-width) flex flex-col h-full">
            {currentPage === 'chat' && <ChatView />}
            {currentPage === 'tasks' && <TasksPage />}
          </div>
        </div>
        <WorkspacePanel />
      </main>

      <PetCompanion />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHatchModal && <PetHatchModal onClose={() => setShowHatchModal(false)} />}
      {showTelegramModal && <TelegramModal onClose={() => setShowTelegramModal(false)} />}
    </div>
  )
}

export default App
