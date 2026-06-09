import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { usePetStore } from '../../stores'
import { getSvgPath } from '../../utils/petTheme'

export function PetWindow() {
  const pet = usePetStore(s => s.pet)
  const packages = usePetStore(s => s.packages)
  const packagesLoaded = usePetStore(s => s.packagesLoaded)
  const store = usePetStore

  const [svgFailed, setSvgFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const attentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const currentPkg = useMemo(() =>
    packages.find(p => p.id === 'clawd'),
    [packages]
  )

  const svgPath = useMemo(() => {
    const p = store.getState().pet
    if (!p || !currentPkg) return null
    setSvgFailed(false)
    return getSvgPath(currentPkg, p.state)
  }, [currentPkg, pet?.state])

  const handleInteract = useCallback(() => {
    const s = store.getState()
    s.interact()
    if (attentionTimer.current) clearTimeout(attentionTimer.current)
    attentionTimer.current = setTimeout(() => s.setState('idle'), 3000)
  }, [])

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
        cursor: 'grab',
      }}
      onMouseDown={handleInteract}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        style={{
          width: '180px',
          height: '180px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {svgPath && !svgFailed ? (
          <object
            key={svgPath}
            data={svgPath}
            type="image/svg+xml"
            style={{ width: '180px', height: '180px', pointerEvents: 'none' }}
            aria-label={pet.name}
            onError={() => setSvgFailed(true)}
          />
        ) : (
          <div
            style={{
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '64px',
            }}
          >
            🐾
          </div>
        )}
      </div>
    </div>
  )
}
