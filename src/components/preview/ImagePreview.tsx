import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface ImagePreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

export function ImagePreview({ filePath, onLoaded, onError }: ImagePreviewProps) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string>(filePath)

  useEffect(() => {
    async function resolveSrc() {
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/core')
        setSrc(convertFileSrc(filePath))
      } catch {
        setSrc(filePath)
      }
    }
    resolveSrc()
  }, [filePath])

  return (
    <div className="h-full flex items-center justify-center p-4 overflow-auto bg-[repeating-conic-gradient(var(--color-surface-secondary)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
      <img
        src={src}
        alt={filePath.split(/[/\\]/).pop() || 'preview'}
        className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
        onLoad={onLoaded}
        onError={() => onError(t('filePreview.imageLoadError'))}
      />
    </div>
  )
}
