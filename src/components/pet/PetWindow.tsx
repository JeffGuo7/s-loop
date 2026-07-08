import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { usePetStore } from '../../stores'
import { getSvgPath, getMiniSvgPath } from '../../utils/petTheme'
import type { PetAnimationState, PetMood } from '../../types/pet'

export function PetWindow() {
  const pet = usePetStore(s => s.pet)
  const packages = usePetStore(s => s.packages)
  const packagesLoaded = usePetStore(s => s.packagesLoaded)
  const store = usePetStore

  const [displayState, setDisplayState] = useState<PetAnimationState>('idle')
  const [displayAnimFile, setDisplayAnimFile] = useState<string | null>(null)
  const [svgFailed, setSvgFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isMini, setIsMini] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    store.getState().loadPackages().then(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!loaded || !packagesLoaded) return
    const s = store.getState()
    if (!s.pet) {
      s.hatch('Clawd', 'Friendly', 'clawd')
    }
  }, [loaded, packagesLoaded])

  // Poll pet state for idle animations (Tauri events only send state changes)
  useEffect(() => {
    const interval = setInterval(() => {
      const s = store.getState()
      if (!s.pet) return
      setDisplayState(s.pet.state)
      setDisplayAnimFile(s.pet.idleAnimationFile || null)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // Listen for Tauri pet-state events
  useEffect(() => {
    let unlisten: (() => void) | null = null
    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        const fn = await listen<{ state: PetAnimationState; mood: PetMood }>(
          'pet-state',
          (event) => {
            setDisplayState(event.payload.state)
          }
        )
        unlisten = fn
      } catch {
        // Not in Tauri, use store directly
      }
    }
    setup()
    return () => { if (unlisten) unlisten() }
  }, [])

  const currentPkg = useMemo(() =>
    packages.find(p => p.id === 'clawd'),
    [packages]
  )

  const currentState = displayState

  const svgPath = useMemo(() => {
    const p = store.getState().pet
    if (!p || !currentPkg) return null
    setSvgFailed(false)

    // Idle animation file takes priority
    if (p.state === 'idle' && p.idleAnimationFile) {
      return `${currentPkg.assetsPath}/${p.idleAnimationFile}`
    }
    // Mini mode uses mini SVGs
    if (isMini) {
      return getMiniSvgPath(currentPkg, currentState)
    }
    return getSvgPath(currentPkg, currentState)
  }, [currentPkg, currentState, isMini, displayAnimFile])

  const petSize = isMini ? 80 : 180

  const handleInteract = useCallback(() => {
    const s = store.getState()
    s.interact()
  }, [])

  const handleDoubleClick = useCallback(() => {
    store.getState().onDoubleClick()
    setIsMini(m => !m)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    store.getState().onRightClick()
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY }
    setIsDragging(false)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStart.current) return
    const dx = Math.abs(e.clientX - dragStart.current.x)
    const dy = Math.abs(e.clientY - dragStart.current.y)
    if (dx > 4 || dy > 4) {
      if (!isDragging) {
        setIsDragging(true)
        store.getState().onDrag()
      }
    }
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    dragStart.current = null
    if (!isDragging) {
      handleInteract()
    }
    setIsDragging(false)
  }, [isDragging, handleInteract])

  if (!loaded || !packagesLoaded || !pet) {
    return <div style={{ width: '100%', height: '100%', background: 'transparent' }} />
  }

  return (
    <div
      data-tauri-drag-region
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        style={{
          width: `${petSize}px`,
          height: `${petSize}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          transition: 'width 0.3s ease, height 0.3s ease',
        }}
      >
        {svgPath && !svgFailed ? (
          <object
            key={svgPath}
            data={svgPath}
            type="image/svg+xml"
            style={{ width: `${petSize}px`, height: `${petSize}px`, pointerEvents: 'none' }}
            aria-label={pet.name}
            onError={() => setSvgFailed(true)}
          />
        ) : (
          <div
            style={{
              width: `${petSize - 20}px`,
              height: `${petSize - 20}px`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isMini ? '32px' : '64px',
            }}
          >
            🐾
          </div>
        )}
      </div>
    </div>
  )
}
