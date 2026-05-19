import { useState } from 'react';
import { useTelegramStore } from '../../stores';
import {
  Send,
  Link,
  Link2Off,
  Trash2,
  Plus,
  X,
  Loader2,
  MessageSquare,
} from 'lucide-react';

interface TelegramSettingsProps {
  onClose?: () => void;
}

export function TelegramSettings({ onClose }: TelegramSettingsProps) {
  const {
    config,
    setConfig,
    connect,
    disconnect,
    sendMessage,
    clearMessages,
    messages,
    isConnected,
    isConnecting,
    error,
  } = useTelegramStore();

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState('');
  const [testMessage, setTestMessage] = useState('');

  const handleAddUser = () => {
    if (!newUser.trim()) return;
    setConfig({
      allowedUsers: [...config.allowedUsers, newUser.trim()],
    });
    setNewUser('');
    setShowAddUser(false);
  };

  const handleRemoveUser = (user: string) => {
    setConfig({
      allowedUsers: config.allowedUsers.filter((u) => u !== user),
    });
  };

  const handleSendTest = async () => {
    if (!testMessage.trim()) return;
    await sendMessage(testMessage.trim());
    setTestMessage('');
  };

  return (
    <div className="h-full flex flex-col bg-(--color-surface)">
      <div className="modal-header">
        <div>
          <p className="section-kicker mb-2">Remote Control</p>
          <h2 className="section-heading flex items-center gap-3">
            <MessageSquare size={22} className="text-(--color-accent)" />
            Telegram Integration
          </h2>
          <p className="text-sm text-(--color-text-secondary) mt-2 max-w-2xl">
            Connect Telegram to interact with Snotra remotely, review pending actions, and run lightweight workflows from your phone.
          </p>
        </div>
        <button
          onClick={onClose}
          className="btn btn-ghost btn-icon"
          aria-label="Close Telegram integration"
        >
          <X size={18} />
        </button>
      </div>

      <div className="modal-body custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-8">

      {/* Connection Status */}
      <section className="surface-panel-subtle p-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-(--color-text-tertiary)/10 text-(--color-text-secondary)'}`}>
            {isConnected ? <Link size={24} /> : <Link2Off size={24} />}
          </div>
          <div>
            <p className="font-bold text-base text-(--color-text-primary)">
              {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Not Connected'}
            </p>
            {isConnected && (
              <p className="text-sm text-green-500/80 font-medium mt-0.5">Bot is actively listening</p>
            )}
            {error && (
              <p className="text-sm text-(--color-error) mt-0.5">{error}</p>
            )}
          </div>
        </div>

        <button
          onClick={isConnected ? disconnect : connect}
          disabled={isConnecting || !config.botToken || !config.chatId}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all
            ${isConnected
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
              : 'bg-(--color-accent) text-white hover:scale-[1.02] active:scale-95 shadow-md shadow-(--color-accent)/20'
            }
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
          `}
        >
          {isConnecting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Connecting...
            </>
          ) : isConnected ? (
            <>
              <Link2Off size={18} strokeWidth={2.5} />
              Disconnect
            </>
          ) : (
            <>
              <Link size={18} strokeWidth={2.5} />
              Connect
            </>
          )}
        </button>
      </section>

      {/* Configuration */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-8">
      <div className="space-y-6">
        {/* Bot Token */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1">Bot Token</label>
          <input
            type="password"
            value={config.botToken}
            onChange={(e) => setConfig({ botToken: e.target.value })}
            placeholder="Enter your Telegram bot token"
            className="w-full px-5 py-4 rounded-2xl bg-(--color-surface-secondary) border border-(--color-border) focus:outline-none focus:ring-2 focus:ring-(--color-accent) font-mono text-sm transition-all"
          />
          <p className="text-xs text-(--color-text-secondary) ml-1 mt-1.5 opacity-70">
            Get a token from @BotFather on Telegram
          </p>
        </div>

        {/* Chat ID */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1">Chat ID</label>
          <input
            type="text"
            value={config.chatId}
            onChange={(e) => setConfig({ chatId: e.target.value })}
            placeholder="Your Telegram chat ID"
            className="w-full px-5 py-4 rounded-2xl bg-(--color-surface-secondary) border border-(--color-border) focus:outline-none focus:ring-2 focus:ring-(--color-accent) font-mono text-sm transition-all"
          />
          <p className="text-xs text-(--color-text-secondary) ml-1 mt-1.5 opacity-70">
            Use @userinfobot to find your chat ID
          </p>
        </div>

        {/* Allowed Users */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1">Allowed Users</label>
          <div className="flex flex-wrap gap-2 mb-3 min-h-[44px] items-center bg-(--color-surface-secondary)/50 p-4 rounded-2xl border border-(--color-border)/50">
            {config.allowedUsers.map((user) => (
              <div
                key={user}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-(--color-surface) border border-(--color-border) shadow-sm"
              >
                <span className="text-sm font-medium">@{user}</span>
                <button
                  onClick={() => handleRemoveUser(user)}
                  className="text-(--color-text-tertiary) hover:text-red-500 transition-colors p-0.5 rounded-full hover:bg-red-500/10"
                >
                  <X size="14" />
                </button>
              </div>
            ))}
            {config.allowedUsers.length === 0 && (
              <p className="text-sm text-(--color-text-secondary) opacity-50 italic mx-auto">
                No users added yet. Add a user to allow remote access.
              </p>
            )}
          </div>

          {showAddUser ? (
            <div className="flex gap-2 animate-fade-in-up">
              <input
                type="text"
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                placeholder="Telegram username (without @)"
                className="flex-1 px-5 py-3 rounded-xl bg-(--color-surface-secondary) border border-(--color-border) focus:outline-none focus:ring-2 focus:ring-(--color-accent) text-sm transition-all"
              />
              <button
                onClick={handleAddUser}
                className="px-6 py-3 rounded-xl bg-(--color-accent) text-white hover:scale-[1.02] active:scale-95 transition-all shadow-md shadow-(--color-accent)/20 font-bold text-sm"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddUser(false)}
                className="px-6 py-3 rounded-xl hover:bg-(--color-surface-secondary) font-bold text-sm text-(--color-text-secondary) transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 text-sm text-(--color-accent) hover:text-(--color-accent-light) font-bold transition-colors ml-1"
            >
              <Plus size={18} strokeWidth={3} />
              Add user
            </button>
          )}
        </div>
      </div>

      {/* Test Message */}
      <div className="space-y-6">
      {isConnected && (
        <div className="surface-panel-subtle p-6">
          <h3 className="text-base font-bold mb-4">Test Message</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Send a test message..."
              className="field-shell flex-1"
            />
            <button
              onClick={handleSendTest}
              disabled={!testMessage.trim()}
              className="btn btn-primary px-5"
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </div>
      )}

      {/* Message History */}
      {messages.length > 0 && (
        <div className="surface-panel-subtle p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold">Message History</h3>
            <button
              onClick={clearMessages}
              className="btn btn-ghost btn-sm text-(--color-text-secondary) hover:text-(--color-error)"
            >
              <Trash2 size={14} />
              Clear
            </button>
          </div>

          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{msg.from}</span>
                  <span className="text-xs text-(--color-text-secondary)">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-(--color-text-secondary) leading-relaxed">{msg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
      </section>

      {/* Commands Info */}
      <div className="surface-panel-subtle p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="section-kicker mb-2">Command Surface</p>
            <h3 className="text-base font-bold text-(--color-text)">Available Commands</h3>
          </div>
          <div className="badge badge-accent">Telegram Bot</div>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-(--color-text-secondary)">
          <li className="surface-panel bg-(--color-surface) p-4"><code className="mr-2">/status</code>Check Snotra status</li>
          <li className="surface-panel bg-(--color-surface) p-4"><code className="mr-2">/chat</code>Start a new conversation</li>
          <li className="surface-panel bg-(--color-surface) p-4"><code className="mr-2">/approve</code>Approve pending permissions</li>
          <li className="surface-panel bg-(--color-surface) p-4"><code className="mr-2">/tasks</code>List scheduled tasks</li>
          <li className="surface-panel bg-(--color-surface) p-4 md:col-span-2"><code className="mr-2">/help</code>Show all commands</li>
        </ul>
      </div>
    </div>
      </div>
    </div>
  );
}
