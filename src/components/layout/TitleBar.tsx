import { useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'
import { SLoopMark } from '../ui'

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function TitleBar() {
  const appWindow = inTauri ? getCurrentWindow() : null
  const handleMinimize = () => appWindow?.minimize()
  const handleMaximize = async () => {
    await appWindow?.toggleMaximize()
  }
  const handleClose = () => appWindow?.close()

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Double-click to maximize
    if (e.detail === 2) {
      handleMaximize()
      return
    }
    // Only start drag when clicking the outer div background (not on buttons)
    if (e.target === e.currentTarget) {
      appWindow?.startDragging().catch(() => {})
    }
  }, [])

  return (
    <div
      className="h-[42px] w-full flex items-center justify-between border-b border-border bg-bg/95 select-none fixed top-0 left-0 right-0 z-[100] pl-3 pr-0 cursor-default backdrop-blur-xl"
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center gap-2.5 pointer-events-none select-none">
        <SLoopMark size="sm" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
          S-Loop
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="text-[10px] font-medium text-text-tertiary">Agent workbench</span>
      </div>

      <div className={`items-center h-full relative z-50 ${inTauri ? 'flex' : 'hidden'}`}>
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center text-text-tertiary hover:bg-surface-secondary transition-colors group/btn"
        >
          <div className="w-3.5 h-[1.2px] bg-current opacity-80" />
        </button>

        {/* Maximize/Restore */}
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center text-text-tertiary hover:bg-surface-secondary transition-colors group/btn"
        >
          <div className="w-3 h-3 border-[1.2px] border-current rounded-[2px] opacity-80" />
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center text-text-tertiary hover:bg-[#e81123] hover:text-white transition-colors group/close"
        >
          <X size={16} strokeWidth={1.5} className="opacity-80 group-hover/close:opacity-100" />
        </button>
      </div>
    </div>
  )
}
