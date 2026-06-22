import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '../../stores'
import { PlatformCard } from './PlatformCard'
import { PlatformMessageLog } from './PlatformMessageLog'
import { useEffect, useMemo, useState } from 'react'
import { Bot, MessageSquare } from 'lucide-react'

type Tab = 'platforms' | 'log'

export function PlatformCenter() {
  const { t } = useTranslation()
  const { platforms, messages, error, load } = usePlatformStore()
  const [activeTab, setActiveTab] = useState<Tab>('platforms')

  const connectedCount = useMemo(() => platforms.filter((p) => p.connected).length, [platforms])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="h-full flex overflow-hidden bg-transparent">
      {/* Left Sidebar */}
      <aside className="w-64 flex flex-col shrink-0 pt-8 pb-12">
        <div className="px-6 mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-accent/10 text-accent shadow-sm">
              <Bot size={22} />
            </div>
            <h2 className="text-xl font-bold text-text tracking-tighter">{t('platforms.title')}</h2>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-accent opacity-40">
            {t('platforms.subtitle')}
          </p>
        </div>

        <div className="flex-1 px-4 space-y-1.5">
          {[
            { id: 'platforms' as Tab, icon: Bot, label: t('platforms.tabs.platforms') },
            { id: 'log' as Tab, icon: MessageSquare, label: t('platforms.tabs.activityLog') },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-[14px] font-bold tracking-tight transition-all duration-500 border ${
                activeTab === item.id
                  ? 'bg-white dark:bg-white/10 border-accent/20 text-accent shadow-sm ring-1 ring-accent/5'
                  : 'text-text-secondary border-transparent hover:bg-surface-secondary/70'
              }`}
            >
              <item.icon size={16} className={activeTab === item.id ? 'text-accent' : 'text-text-tertiary'} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="px-6">
          <div className="p-4 rounded-2xl border border-border-light/50 bg-surface-secondary/30">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${connectedCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-text-quaternary opacity-30'}`} />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-tertiary opacity-60">
                {connectedCount > 0 ? `${connectedCount} connected` : t('platforms.status.offline')}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent">
        <header className="h-20 flex items-center px-10 shrink-0 border-b border-border-light/50">
          <h3 className="text-[17px] font-black text-text tracking-tighter">
            {activeTab === 'platforms' ? t('platforms.tabs.platforms') : t('platforms.tabs.activityLog')}
          </h3>
        </header>

        <div className="flex-1 overflow-y-auto px-10 py-10 scrollbar-subtle">
          <div className="max-w-2xl mx-auto space-y-8 animate-fade-in-up">
            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-[13px] text-red-400">
                {error}
              </div>
            )}
            {activeTab === 'platforms' ? (
              <div className="grid gap-4">
                {platforms.map((platform) => (
                  <PlatformCard key={platform.id} platform={platform} />
                ))}
              </div>
            ) : (
              <PlatformMessageLog messages={messages} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
