import { useState, useEffect } from 'react';
import { Sidebar } from './components/layout';
import { ChatView } from './components/chat';
import { SettingsModal } from './components/settings';
import { PetCompanion, PetHatchModal } from './components/companion';
import { TasksPage } from './components/tasks';
import { TelegramModal } from './components/telegram';
import { useAppStore, usePetStore } from './stores';

export type Page = 'chat' | 'tasks';

function App() {
  const { theme } = useAppStore();
  const { pet, showPet, setShowPet } = usePetStore();
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [showSettings, setShowSettings] = useState(false);
  const [showHatchModal, setShowHatchModal] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onOpenSettings={() => setShowSettings(true)}
        onOpenPet={() => {
          if (pet) {
            setShowPet(!showPet);
          } else {
            setShowHatchModal(true);
          }
        }}
        onOpenTelegram={() => setShowTelegramModal(true)}
      />

      {/* Main Content */}
      {currentPage === 'chat' && <ChatView />}
      {currentPage === 'tasks' && <TasksPage />}

      {/* Pet Companion */}
      <PetCompanion />

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* Pet Hatch Modal */}
      {showHatchModal && (
        <PetHatchModal onClose={() => setShowHatchModal(false)} />
      )}

      {/* Telegram Modal */}
      {showTelegramModal && (
        <TelegramModal onClose={() => setShowTelegramModal(false)} />
      )}
    </div>
  );
}

export default App;