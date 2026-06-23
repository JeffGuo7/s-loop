import { useTranslation } from 'react-i18next'
import { FileX } from 'lucide-react'

export function BinaryPreview() {
  const { t } = useTranslation()

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-sm">
        <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-surface-secondary/60 text-text-quaternary">
          <FileX size={28} />
        </div>
        <h3 className="text-[15px] font-bold text-text tracking-tight">
          {t('filePreview.binaryTitle')}
        </h3>
        <p className="text-[12px] text-text-tertiary leading-relaxed">
          {t('filePreview.binaryDesc')}
        </p>
      </div>
    </div>
  )
}
