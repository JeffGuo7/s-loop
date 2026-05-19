import { TelegramSettings } from './TelegramSettings';

export function TelegramPage() {
  return (
    <div className="flex-1 overflow-hidden bg-(--color-bg) h-full">
      <TelegramSettings />
    </div>
  );
}

interface TelegramModalProps {
  onClose: () => void;
}

export function TelegramModal({ onClose }: TelegramModalProps) {
  return (
    <div className="modal-overlay p-4 sm:p-6 lg:p-8">
      <div className="modal-content w-full max-w-5xl h-[85vh] flex flex-row overflow-hidden bg-(--color-bg)">
        <TelegramSettings onClose={onClose} />
      </div>
    </div>
  );
}
