import { useState, useEffect, useMemo } from 'react'
import { usePetStore } from '../../stores'
import { getSvgPath } from '../../utils/petTheme'
import { Sparkles, PawPrint, Trash2, Monitor, MonitorOff, Info, Activity } from 'lucide-react'

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle', 'idle-look': 'Looking', 'idle-bubble': 'Bubbling', 'idle-reading': 'Reading',
  yawning: 'Yawning', dozing: 'Dozing', collapsing: 'Sleepy',
  thinking: 'Thinking', working: 'Working', juggling: 'Juggling',
  attention: 'Attentive', notification: 'Notified',
  error: 'Error', sweeping: 'Sweeping', carrying: 'Carrying',
  sleeping: 'Sleeping', waking: 'Waking',
  building: 'Building',
}

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', neutral: '😐', sleepy: '😴', excited: '🤩',
}

interface PetPageProps {
  onToggleWindow: () => void
}

export function PetPage({ onToggleWindow }: PetPageProps) {
  const pet = usePetStore(s => s.pet)
  const packages = usePetStore(s => s.packages)
  const packagesLoaded = usePetStore(s => s.packagesLoaded)
  const petWindowVisible = usePetStore(s => s.petWindowVisible)
  const { loadPackages, hatch, dismiss, interact } = usePetStore.getState()

  const [showHatch, setShowHatch] = useState(false)
  const [hatchName, setHatchName] = useState('')
  const [svgFailed, setSvgFailed] = useState(false)

  useEffect(() => { loadPackages() }, [loadPackages])

  useEffect(() => {
    if (!pet) setShowHatch(true)
    else setShowHatch(false)
  }, [pet])

  const currentPkg = useMemo(() =>
    packages.find(p => p.id === pet?.packageId),
    [packages, pet?.packageId]
  )

  const svgPath = useMemo(() => {
    if (!pet || !currentPkg) return null
    setSvgFailed(false)
    // Use idle animation file when pet is idle and an animation is playing
    if (pet.state === 'idle' && pet.idleAnimationFile) {
      return `${currentPkg.assetsPath}/${pet.idleAnimationFile}`
    }
    return getSvgPath(currentPkg, pet.state)
  }, [currentPkg, pet?.state, pet?.idleAnimationFile])

  if (!packagesLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-transparent">
        <div className="animate-pulse text-text-tertiary font-bold tracking-tight">Loading...</div>
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
            <h2 className="text-3xl font-bold text-text tracking-tight">Hatch Clawd</h2>
            <p className="text-[14px] text-text-tertiary">Your desktop companion awaits.</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={hatchName}
              onChange={e => setHatchName(e.target.value)}
              placeholder="Name your pet..."
              onKeyDown={e => e.key === 'Enter' && hatchName.trim() && hatch(hatchName.trim())}
              className="w-full px-6 py-4 rounded-2xl bg-surface-secondary/40 border border-border-light focus:border-accent/40 outline-none text-[15px] font-bold text-center tracking-tight transition-all"
              autoFocus
            />

            <button
              onClick={() => hatch(hatchName.trim() || 'Clawd')}
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

        {/* Pet SVG preview */}
        <div className="relative mx-auto cursor-pointer group" onClick={() => interact()}>
          {svgPath && !svgFailed ? (
            <object
              key={svgPath}
              data={svgPath}
              type="image/svg+xml"
              className="w-auto h-auto"
              style={{ width: '180px', height: '180px' }}
              aria-label={pet.name}
              onError={() => setSvgFailed(true)}
            />
          ) : (
            <div
              className="rounded-3xl bg-gradient-to-br from-accent/10 to-surface-secondary/50 flex items-center justify-center border-2 border-dashed border-accent/20"
              style={{ width: '180px', height: '180px' }}
            >
              <PawPrint size={48} className="text-text-quaternary opacity-20" />
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
              {pet.idleAnimationFile && pet.state === 'idle'
                ? STATE_LABELS[pet.idleAnimationFile.replace(/^clawd-/, '').replace(/\.svg$/, '')] || 'Playing'
                : STATE_LABELS[pet.state] || pet.state
              }
            </span>
          </div>
          <p className="text-[14px] text-text-tertiary italic">"{pet.personality}"  {MOOD_EMOJI[pet.mood]}</p>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary opacity-50">
          <div className="flex items-center gap-2">
            <Info size={12} />
            <span>Hatched {new Date(pet.hatchedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} />
            <span>{currentPkg?.displayName || pet.packageId}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <button
            onClick={onToggleWindow}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-surface-secondary/60 text-text-secondary font-bold text-[13px] hover:bg-surface-secondary hover:text-text border border-border-light transition-all"
          >
            {petWindowVisible ? <Monitor size={16} /> : <MonitorOff size={16} />}
            {petWindowVisible ? 'Hide on Desktop' : 'Show on Desktop'}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => interact()}
              className="px-6 py-3 rounded-2xl bg-accent/10 text-accent font-bold text-[13px] hover:bg-accent hover:text-accent-foreground transition-all border border-accent/15"
            >
              <PawPrint size={16} className="inline mr-2" />Interact
            </button>
            <button
              onClick={() => { dismiss(); setShowHatch(true) }}
              className="px-6 py-3 rounded-2xl bg-red-500/10 text-red-400 font-bold text-[13px] hover:bg-red-500/20 transition-all"
            >
              <Trash2 size={16} className="inline mr-2" />Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
