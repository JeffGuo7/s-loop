import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
}

export function CopyButton({ text, label, className = '' }: CopyButtonProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-bold tracking-tight text-text-secondary hover:bg-border/40 transition-all duration-300 active:scale-95 ${className}`}
    >
      {copied ? t('chat.copy.copied') : (label || t('chat.copy.copy'))}
    </button>
  )
}
