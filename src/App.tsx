import { useState, useEffect } from 'react'
import { Sidebar } from './components/layout'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { PetCompanion, PetHatchModal } from './components/companion'
import { TasksPage } from './components/tasks'
import { TelegramModal } from './components/telegram'
import { useAppStore } from './stores'
import { useTaskScheduler } from './hooks'
import { Kilo } from './utils'

export type Page = 'chat' | 'tasks'

function App() {
  const { theme, sidebarCollapsed, toggleSidebar } = useAppStore()
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
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-background)] relative">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-[var(--color-primary)] blur-[120px]" />
        <div className="absolute top-[60%] -right-[5%] w-[30%] h-[30%] rounded-full bg-[var(--color-primary)] blur-[100px]" />
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

      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        {currentPage === 'chat' && <ChatView />}
        {currentPage === 'tasks' && <TasksPage />}
      </main>

      <PetCompanion />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHatchModal && <PetHatchModal onClose={() => setShowHatchModal(false)} />}
      {showTelegramModal && <TelegramModal onClose={() => setShowTelegramModal(false)} />}
    </div>
  )
}

export default App