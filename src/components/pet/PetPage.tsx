import { useState, useEffect } from 'react'
import { usePetStore } from '../../stores'
import { Sparkles, Activity, Info, PawPrint, AlertTriangle } from 'lucide-react'

// ─── Clawd theme.json state mapping ───

const STATE_SVG: Record<string, string> = {
  idle:         'cloudling-idle.svg',
  thinking:     'cloudling-thinking.svg',
  working:      'cloudling-typing.svg',
  failed:       'cloudling-error.svg',
  waiting:      'cloudling-attention.svg',
  jumping:      'cloudling-mini-happy.svg',
  waving:       'cloudling-attention.svg',
  sleeping:     'cloudling-sleeping.svg',
}

const SVG_BASE = '/pets/cloudling/assets'

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle', thinking: 'Thinking', working: 'Working',
  failed: 'Error', waiting: 'Waiting', jumping: 'Playing',
  waving: 'Waving', sleeping: 'Sleeping',
}

export function PetPage() {
  const { pet, hatch, dismiss, interact } = usePetStore()
  const [showHatch, setShowHatch] = useState(!pet)
  const [hatchName, setHatchName] = useState('')
  const [svgLoaded, setSvgLoaded] = useState(true)

  // Check if SVG assets exist
  useEffect(() => {
    fetch(`${SVG_BASE}/cloudling-idle.svg`, { method: 'HEAD' })
      .then(r => { if (!r.ok) setSvgLoaded(false) })
      .catch(() => setSvgLoaded(false))
  }, [])

  if (showHatch || !pet) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-transparent">
        <div className="text-center space-y-8 max-w-md mx-auto animate-fade-in">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-accent opacity-20 blur-[80px] rounded-full scale-150" />
            <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-7xl animate-float shadow-2xl border border-accent/10">
              🥚
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-bold text-text tracking-tight">Hatch a Cloudling</h2>
            <p className="text-[14px] text-text-tertiary">Give your companion a name to bring it to life.</p>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={hatchName}
              onChange={e => setHatchName(e.target.value)}
              placeholder="Name your Cloudling..."
              onKeyDown={e => e.key === 'Enter' && hatchName.trim() && (hatch(hatchName.trim()), setShowHatch(false))}
              className="w-full px-6 py-4 rounded-2xl bg-surface-secondary/40 border border-border-light focus:border-accent/40 outline-none text-[15px] font-bold text-center tracking-tight transition-all"
              autoFocus
            />
            <button
              onClick={() => { hatch(hatchName.trim() || 'Cloudling'); setShowHatch(false) }}
              className="w-full px-8 py-4 rounded-2xl bg-accent text-accent-foreground font-bold text-[15px] shadow-lg shadow-accent/20 hover:shadow-accent/40 transition-all"
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles size={18} />Hatch
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const svgFile = STATE_SVG[pet.state] || STATE_SVG.idle

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-transparent">
      <div className="text-center space-y-10 max-w-lg mx-auto animate-fade-in">

        {/* Pet character — clawd Cloudling SVG */}
        <div
          className="relative mx-auto cursor-pointer group"
          onClick={() => interact()}
        >
          {svgLoaded ? (
            <object
              data={`${SVG_BASE}/${svgFile}`}
              type="image/svg+xml"
              className="w-auto h-auto"
              style={{ width: '240px', height: '200px' }}
              aria-label={pet.name}
            />
          ) : (
            <div className="w-[240px] h-[200px] rounded-3xl bg-gradient-to-br from-accent/10 to-surface-secondary/50 flex items-center justify-center border-2 border-dashed border-accent/20">
              <div className="text-center space-y-3">
                <AlertTriangle size={32} className="text-text-quaternary mx-auto opacity-30" />
                <p className="text-[12px] text-text-quaternary font-bold opacity-30">
                  SVG assets not found.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pet info */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-4xl font-bold text-text tracking-tight">{pet.name}</h1>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/15">
              {STATE_LABELS[pet.state] || pet.state}
            </span>
          </div>
          <p className="text-[14px] text-text-tertiary italic">"{pet.personality}"</p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary opacity-50">
          <div className="flex items-center gap-2">
            <Info size={12} />
            <span>Hatched {new Date(pet.hatchedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} />
            <span>Cloudling</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={() => interact()}
            className="px-6 py-3 rounded-2xl bg-accent/10 text-accent font-bold text-[13px] hover:bg-accent hover:text-accent-foreground transition-all border border-accent/15"
          >
            <PawPrint size={16} className="inline mr-2" />Interact
          </button>
          <button
            onClick={() => { dismiss(); setShowHatch(true) }}
            className="px-6 py-3 rounded-2xl bg-surface-secondary/50 text-text-tertiary font-bold text-[13px] hover:text-text hover:bg-surface-secondary transition-all"
          >
            Dismiss
          </button>
        </div>

        <p className="text-[11px] text-text-quaternary opacity-30">
          Clawd Cloudling — AI companion
        </p>
      </div>
    </div>
  )
}
