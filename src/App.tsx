import { useState, useEffect } from 'react'
import { Sidebar } from './components/layout'
import { ChatView } from './components/chat'
import { SettingsModal } from './components/settings'
import { PetCompanion, PetHatchModal } from './components/companion'
import { TasksPage } from './components/tasks'
import { TelegramModal } from './components/telegram'
import { useAppStore, usePetStore } from './stores'
import { useTaskScheduler } from './hooks'
import { Kilo } from './utils'

export type Page = 'chat' | 'tasks'

function App() {
  const { theme } = useAppStore()
  const { pet, showPet, setShowPet } = usePetStore()
  const [currentPage, setCurrentPage] = useState<Page>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [showHatchModal, setShowHatchModal] = useState(false)
  const [showTelegramModal, setShowTelegramModal] = useState(false)

  useTaskScheduler()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    // Get Kilo URL from Tauri backend, or fallback to default for Vite dev
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
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onOpenSettings={() => setShowSettings(true)}
        onOpenPet={() => {
          if (pet) {
            setShowPet(!showPet)
          } else {
            setShowHatchModal(true)
          }
        }}
        onOpenTelegram={() => setShowTelegramModal(true)}
      />

      {currentPage === 'chat' && <ChatView />}
      {currentPage === 'tasks' && <TasksPage />}

      <PetCompanion />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHatchModal && <PetHatchModal onClose={() => setShowHatchModal(false)} />}
      {showTelegramModal && <TelegramModal onClose={() => setShowTelegramModal(false)} />}
    </div>
  )
}

export default App
