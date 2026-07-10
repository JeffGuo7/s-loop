import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSkillStore } from '../../stores/skillStore'
import { FileArchive, Loader2, Check, AlertCircle } from 'lucide-react'

export function SkillDropZone() {
  const { t } = useTranslation()
  const { installSkillZip } = useSkillStore()
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'installing' | 'done' | 'error'>('idle')
  const [statusText, setStatusText] = useState('')

  const reset = useCallback(() => {
    setDragging(false)
    setStatus('idle')
    setStatusText('')
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Only show skill drop overlay when dragging a .zip file
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      const hasZip = Array.from(e.dataTransfer.items).some(
        item => item.kind === 'file' && (
          item.type === 'application/zip' ||
          item.type === 'application/x-zip-compressed' ||
          item.type === 'application/octet-stream'
        )
      )
      // If we can reliably check MIME types and no zip is found, hide overlay
      setDragging(hasZip)
    } else {
      // Fallback: if items unavailable, only show for 'Files' type (broad match)
      if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).some(t => t === 'Files')) {
        setDragging(true)
      }
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.relatedTarget === null) {
      reset()
    }
  }, [reset])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) {
      reset()
      return
    }

    const zipFile = Array.from(files).find(f => f.name.endsWith('.zip') || f.type === 'application/zip')
    if (!zipFile) {
      reset()
      return
    }

    setStatus('installing')
    setStatusText(t('skills.installing'))

    try {
      const bytes = await zipFile.arrayBuffer()
      const zipBase64 = arrayBufferToBase64(bytes)
      await installSkillZip(zipBase64)

      setStatus('done')
      setStatusText(t('skills.installed'))
      setTimeout(reset, 2000)
    } catch (err) {
      setStatus('error')
      setStatusText(err instanceof Error ? err.message : t('skills.zipParseError'))
      setTimeout(reset, 3000)
    }
  }, [t, installSkillZip, reset])

  useEffect(() => {
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [handleDragOver, handleDragLeave, handleDrop])

  if (!dragging && status === 'idle') return null

  return (
    <div className="fixed inset-0 z-[9999] bg-black/30 backdrop-blur-sm flex items-center justify-center pointer-events-none animate-fade-in">
      <div className={`border-2 rounded-[var(--radius-lg)] p-12 text-center shadow-2xl ${
        status === 'done'
          ? 'border-[var(--color-success)] bg-[var(--color-success)]/5'
          : status === 'error'
          ? 'border-[var(--color-error)] bg-[var(--color-error)]/5'
          : 'border-[var(--color-accent)] bg-[var(--color-surface)]/95'
      }`}>
        {status === 'idle' && (
          <>
            <FileArchive className="w-16 h-16 text-[var(--color-accent)] mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[var(--color-text)]">{t('skills.dropTitle')}</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t('skills.dropDesc')}</p>
          </>
        )}
        {status === 'installing' && (
          <>
            <Loader2 className="w-16 h-16 text-[var(--color-accent)] mx-auto mb-4 animate-spin" />
            <h3 className="text-xl font-bold text-[var(--color-text)]">{statusText}</h3>
          </>
        )}
        {status === 'done' && (
          <>
            <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-[var(--color-success)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--color-success)]">{statusText}</h3>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-[var(--color-error)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--color-error)]">{statusText}</h3>
          </>
        )}
      </div>
    </div>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}
