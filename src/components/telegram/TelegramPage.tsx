import { TelegramSettings } from './TelegramSettings'

export function TelegramPage() {
  return (
    <div className="flex-1 w-full max-w-(--chat-max-width) mx-auto h-full flex flex-col overflow-hidden animate-fade-in">
      <div className="flex-1 overflow-hidden">
        <TelegramSettings />
      </div>
    </div>
  )
}
