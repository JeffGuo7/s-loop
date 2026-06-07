import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePetStore } from '../../stores'
import { ATLAS, ROW_BY_KEY, STATE_ROW, rowStylesheet, rowTotalMs } from '../../types/pet'
import { PawPrint, Sparkles, Activity, Info } from 'lucide-react'

export function PetPage() {
  const { t } = useTranslation()
  const { pet, hatch, dismiss, interact } = usePetStore()
  const [showHatch, setShowHatch] = useState(!pet)
  const [hatchName, setHatchName] = useState('')

  // Inject global keyframes once
  useEffect(() => {
    const id = 'pet-animations'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = rowStylesheet('pet', ATLAS)
    document.head.appendChild(style)
  }, [])

  if (showHatch || !pet) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-transparent">
        <div className="text-center space-y-8 max-w-md mx-auto animate-fade-in">
          {/* Egg */}
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-accent opacity-20 blur-[80px] rounded-full scale-150" />
            <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-7xl animate-float shadow-2xl border border-accent/10">
              🥚
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-text tracking-tight">{t('pet.hatch.title')}</h2>
            <p className="text-[14px] text-text-tertiary">{t('pet.hatch.description')}</p>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={hatchName}
              onChange={(e) => setHatchName(e.target.value)}
              placeholder={t('pet.hatch.namePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && hatchName.trim() && (hatch(hatchName.trim()), setShowHatch(false))}
              className="w-full px-6 py-4 rounded-2xl bg-surface-secondary/40 border border-border-light focus:border-accent/40 outline-none text-[15px] font-bold text-center tracking-tight transition-all"
            />
            <button
              onClick={() => { hatch(hatchName.trim() || 'Cloudling'); setShowHatch(false) }}
              className="w-full px-8 py-4 rounded-2xl bg-accent text-accent-foreground font-bold text-[15px] shadow-lg shadow-accent/20 hover:shadow-accent/40 transition-all"
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles size={18} />
                {t('pet.hatch.button')}
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const row = ROW_BY_KEY.get(STATE_ROW[pet.state]) ?? ROW_BY_KEY.get('idle')!
  const anim = {
    name: `pet-${row.key}`,
    durationMs: rowTotalMs(row),
    iterationCount: pet.state === 'jumping' || pet.state === 'waving' || pet.state === 'failed' ? 1 : 'infinite' as const,
  }

  const { frameWidth, frameHeight } = ATLAS
  const scale = 2 // Display at 2x (384×416)

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-transparent">
      <div className="text-center space-y-10 max-w-lg mx-auto animate-fade-in">
        {/* Pet character */}
        <div
          className="relative mx-auto cursor-pointer hover:scale-105 transition-transform duration-300 group"
          onClick={() => interact()}
          style={{
            width: frameWidth * scale,
            height: frameHeight * scale,
            backgroundImage: 'url(/pets/default/spritesheet.png)',
            backgroundSize: `${ATLAS.width * scale}px ${ATLAS.height * scale}px`,
            backgroundRepeat: 'no-repeat',
            animationName: anim.name,
            animationDuration: `${anim.durationMs}ms`,
            animationTimingFunction: `step-end`,
            animationIterationCount: anim.iterationCount,
            animationFillMode: anim.iterationCount === 1 ? 'forwards' : 'none',
          }}
        >
          {/* Fallback emoji behind the spritesheet (visible when spritesheet not loaded) */}
          <div className="absolute inset-0 flex items-center justify-center text-9xl opacity-10 pointer-events-none select-none">
            🐣
          </div>
        </div>

        {/* Pet info */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-4xl font-bold text-text tracking-tight">{pet.name}</h1>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/15">
              {pet.state}
            </span>
          </div>
          <p className="text-[14px] text-text-tertiary italic">"{pet.personality}"</p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary opacity-50">
          <div className="flex items-center gap-2">
            <Info size={12} />
            <span>{new Date(pet.hatchedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} />
            <span>{pet.packageId}</span>
          </div>
          <div className="flex items-center gap-2">
            <PawPrint size={12} />
            <span>{pet.state === 'sleeping' ? '💤 Sleeping' : pet.state === 'thinking' ? '🤔 Thinking' : 'Active'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={() => interact()}
            className="px-6 py-3 rounded-2xl bg-accent/10 text-accent font-bold text-[13px] hover:bg-accent hover:text-accent-foreground transition-all border border-accent/15"
          >
            <PawPrint size={16} className="inline mr-2" />
            Interact
          </button>
          <button
            onClick={() => { dismiss(); setShowHatch(true) }}
            className="px-6 py-3 rounded-2xl bg-surface-secondary/50 text-text-tertiary font-bold text-[13px] hover:text-text hover:bg-surface-secondary transition-all"
          >
            Dismiss
          </button>
        </div>

        <p className="text-[11px] text-text-quaternary opacity-30">{t('pet.footer')}</p>
      </div>
    </div>
  )
}
