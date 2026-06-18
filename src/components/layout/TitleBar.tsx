import { useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'

const appWindow = getCurrentWindow()

export function TitleBar() {

  const handleMinimize = () => appWindow.minimize()
  const handleMaximize = async () => {
    await appWindow.toggleMaximize()
  }
  const handleClose = () => appWindow.close()

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Double-click to maximize
    if (e.detail === 2) {
      handleMaximize()
      return
    }
    // Only start drag when clicking the outer div background (not on buttons)
    if (e.target === e.currentTarget) {
      appWindow.startDragging().catch(() => {})
    }
  }, [])

  return (
    <div
      className="h-10 w-full flex items-center justify-between bg-transparent select-none fixed top-0 left-0 right-0 z-[100] px-4 cursor-default"
      onMouseDown={handleMouseDown}
    >
      {/* Irregular Static Logo with S */}
      <div className="flex items-center gap-3 pointer-events-none select-none">
        <div className="relative w-8 h-8 flex items-center justify-center">
          {/* Irregular Shape (Static) */}
          <div className="absolute inset-0 bg-accent rounded-[38%_62%_63%_37%/41%_44%_56%_59%] shadow-lg shadow-accent/10" />
          <span className="relative text-[18px] font-serif italic font-black text-white leading-none translate-y-[0.5px]">
            S
          </span>
        </div>
        <span className="text-[12px] font-black uppercase tracking-[0.3em] text-text-tertiary opacity-40">
          S-Loop
        </span>
      </div>

      {/* Window Controls - Simple & Clean (Matching User's Screenshot) */}
      <div className="flex items-center -mr-4 h-full relative z-50">
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="w-12 h-10 flex items-center justify-center text-text-tertiary hover:bg-black/5 dark:hover:bg-white/5 transition-colors group/btn"
        >
          <div className="w-3.5 h-[1.2px] bg-current opacity-80" />
        </button>

        {/* Maximize/Restore */}
        <button
          onClick={handleMaximize}
          className="w-12 h-10 flex items-center justify-center text-text-tertiary hover:bg-black/5 dark:hover:bg-white/5 transition-colors group/btn"
        >
          <div className="w-3 h-3 border-[1.2px] border-current rounded-[2px] opacity-80" />
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="w-12 h-10 flex items-center justify-center text-text-tertiary hover:bg-[#e81123] hover:text-white transition-all group/close"
        >
          <X size={16} strokeWidth={1.5} className="opacity-80 group-hover/close:opacity-100" />
        </button>
      </div>
    </div>
  )
}
