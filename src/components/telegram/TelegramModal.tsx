import { TelegramSettings } from './TelegramSettings';

export function TelegramPage() {
  return (
    <div className="flex-1 overflow-hidden bg-bg h-full">
      <TelegramSettings />
    </div>
  );
}

interface TelegramModalProps {
  onClose: () => void;
}

export function TelegramModal({ onClose }: TelegramModalProps) {
  return (
    <div className="modal-overlay p-6 sm:p-10 lg:p-14">
      <div className="modal-content w-full max-w-6xl h-[90vh] flex flex-row overflow-hidden bg-bg rounded-[48px] shadow-3xl">
        <TelegramSettings onClose={onClose} />
      </div>
    </div>
  );
}
