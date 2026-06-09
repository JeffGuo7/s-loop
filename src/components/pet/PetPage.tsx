import { useState, useEffect, useMemo } from 'react'
import { usePetStore } from '../../stores'
import { getSvgPath } from '../../utils/petTheme'
import { Sparkles, Activity, Info, PawPrint, AlertTriangle } from 'lucide-react'

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle', yawning: 'Yawning', dozing: 'Dozing',
  collapsing: 'Collapsing', thinking: 'Thinking', working: 'Working',
  juggling: 'Juggling', attention: 'Attention', notification: 'Notification',
  error: 'Error', sweeping: 'Sweeping', carrying: 'Carrying',
  sleeping: 'Sleeping', waking: 'Waking',
}

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', neutral: '😐', sleepy: '😴', excited: '🤩',
}

export function PetPage() {
  const { pet, packages, packagesLoaded, loadPackages, hatch, dismiss, interact } = usePetStore()
  const [showHatch, setShowHatch] = useState(!pet)
  const [hatchName, setHatchName] = useState('')
  const [hatchPkg, setHatchPkg] = useState('cloudling')
  const [svgFailed, setSvgFailed] = useState(false)

  useEffect(() => { loadPackages() }, [loadPackages])

  const currentPkg = useMemo(() => packages.find(p => p.id === pet?.packageId), [packages, pet?.packageId])

  const svgPath = useMemo(() => {
    if (!pet || !currentPkg) return null
    setSvgFailed(false)
    return getSvgPath(currentPkg, pet.state)
  }, [currentPkg, pet?.state])

  if (!packagesLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-transparent">
        <div className="animate-pulse text-text-tertiary font-bold tracking-tight">Loading pets...</div>
      </div>
    )
  }

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
            <h2 className="text-3xl font-bold text-text tracking-tight">Hatch a Pet</h2>
            <p className="text-[14px] text-text-tertiary">Choose your companion and give it a name.</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={hatchName}
              onChange={e => setHatchName(e.target.value)}
              placeholder="Name your pet..."
              onKeyDown={e => e.key === 'Enter' && hatchName.trim() && (hatch(hatchName.trim(), 'Friendly', hatchPkg), setShowHatch(false))}
              className="w-full px-6 py-4 rounded-2xl bg-surface-secondary/40 border border-border-light focus:border-accent/40 outline-none text-[15px] font-bold text-center tracking-tight transition-all"
              autoFocus
            />

            {packages.length > 1 && (
              <div className="flex items-center justify-center gap-3">
                <span className="text-[13px] font-bold text-text-tertiary">Type:</span>
                <div className="flex gap-2">
                  {packages.map(pkg => (
                    <button
                      key={pkg.id}
                      onClick={() => setHatchPkg(pkg.id)}
                      className={`px-5 py-2.5 rounded-xl text-[13px] font-bold tracking-tight transition-all border ${
                        hatchPkg === pkg.id
                          ? 'bg-accent text-accent-foreground border-accent shadow-sm'
                          : 'bg-surface-secondary/40 text-text-secondary border-border-light hover:border-accent/30'
                      }`}
                    >
                      {pkg.displayName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { hatch(hatchName.trim() || 'Cloudling', 'Friendly', hatchPkg); setShowHatch(false) }}
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

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-transparent">
      <div className="text-center space-y-8 max-w-lg mx-auto animate-fade-in">

        {/* Pet theme switcher */}
        {packages.length > 1 && (
          <div className="flex items-center justify-center gap-2">
            {packages.map(pkg => (
              <button
                key={pkg.id}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.15em] transition-all border ${
                  pet.packageId === pkg.id
                    ? 'bg-accent/10 text-accent border-accent/20'
                    : 'text-text-quaternary border-transparent hover:text-text-tertiary'
                }`}
              >
                {pkg.displayName}
              </button>
            ))}
          </div>
        )}

        {/* Pet SVG */}
        <div className="relative mx-auto cursor-pointer group" onClick={() => interact()}>
          {svgPath && !svgFailed ? (
            <object
              key={svgPath}
              data={svgPath}
              type="image/svg+xml"
              className="w-auto h-auto"
              style={currentPkg?.id === 'clawd' ? { width: '180px', height: '180px' } : { width: '240px', height: '200px' }}
              aria-label={pet.name}
              onError={() => setSvgFailed(true)}
            />
          ) : (
            <div
              className="rounded-3xl bg-gradient-to-br from-accent/10 to-surface-secondary/50 flex items-center justify-center border-2 border-dashed border-accent/20"
              style={currentPkg?.id === 'clawd' ? { width: '180px', height: '180px' } : { width: '240px', height: '200px' }}
            >
              <div className="text-center space-y-2">
                <AlertTriangle size={28} className="text-text-quaternary mx-auto opacity-30" />
                <p className="text-[11px] text-text-quaternary font-bold opacity-30">
                  {currentPkg?.id === 'clawd' ? 'Clawd' : 'Cloudling'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pet info */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-4xl font-bold text-text tracking-tight">{pet.name}</h1>
            <span className={`text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${
              pet.state === 'error'
                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                : pet.state === 'sleeping'
                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                  : 'bg-accent/10 text-accent border-accent/15'
            }`}>
              {STATE_LABELS[pet.state] || pet.state}
            </span>
          </div>
          <p className="text-[14px] text-text-tertiary italic">"{pet.personality}"</p>
          <p className="text-[14px] text-text-tertiary">
            {MOOD_EMOJI[pet.mood] || '😐'} {pet.mood}
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary opacity-50">
          <div className="flex items-center gap-2">
            <Info size={12} />
            <span>Hatched {new Date(pet.hatchedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} />
            <span>{currentPkg?.displayName || 'Pet'}</span>
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
          {currentPkg?.id === 'clawd' ? 'Clawd' : 'Cloudling'} — AI companion
        </p>
      </div>
    </div>
  )
}
