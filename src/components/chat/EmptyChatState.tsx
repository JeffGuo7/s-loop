import { FolderTree, MessagesSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SLoopMark } from '../ui'

export function EmptyChatState({
  leftPanelMode,
  onToggleLeftPanel,
}: {
  leftPanelMode: 'sessions' | 'files'
  onToggleLeftPanel: () => void
}) {
  const { t } = useTranslation()

    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-transparent relative selection:bg-accent/10">
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={onToggleLeftPanel}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors duration-150 hover:border-accent/30 hover:text-accent"
          >
            {leftPanelMode === 'files' ? <MessagesSquare size={14} /> : <FolderTree size={14} />}
            {leftPanelMode === 'files' ? t('chat.layout.backToSessions') : t('chat.layout.openFiles')}
          </button>
        </div>
        <div className="relative z-10 w-full flex flex-col items-center justify-center text-center px-8 max-w-3xl mx-auto h-full">
          <div className="mb-7 shrink-0">
            <SLoopMark size="hero" />
          </div>
          <div className="space-y-3 mb-10 w-full">
            <h2 className="text-3xl sm:text-[38px] font-semibold tracking-[-0.035em] text-text leading-tight select-none">
              {t('chat.welcome.title')} <span className="text-accent">{t('chat.welcome.appName')}</span>
            </h2>
            <div className="flex justify-center w-full">
              <p className="text-sm text-text-secondary leading-6 max-w-xl font-normal text-center">{t('chat.welcome.description')}</p>
            </div>
          </div>
        </div>
      </div>
    )
}
