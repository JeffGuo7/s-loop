import { TelegramSettings } from './TelegramSettings';
import { X } from 'lucide-react';

export function TelegramPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
      <TelegramSettings />
    </div>
  );
}

interface TelegramModalProps {
  onClose: () => void;
}

export function TelegramModal({ onClose }: TelegramModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[var(--color-surface)] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-bold">Telegram Integration</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <TelegramSettings />
        </div>
      </div>
    </div>
  );
}