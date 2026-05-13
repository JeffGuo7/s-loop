import { useState } from 'react';
import { useTelegramStore } from '../../stores';
import {
  Send,
  Link,
  Link2Off,
  Trash2,
  Plus,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  MessageSquare,
} from 'lucide-react';

export function TelegramSettings() {
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
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <MessageSquare size={24} className="text-[var(--color-primary)]" />
        Telegram Integration
      </h2>

      <p className="text-sm text-[var(--color-text-secondary)] mb-6">
        Connect Telegram to interact with Snotra remotely. Send messages, approve permissions,
        and manage tasks from your phone.
      </p>

      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle size={20} className="text-green-500" />
            ) : isConnecting ? (
              <Loader2 size={20} className="animate-spin text-blue-500" />
            ) : error ? (
              <AlertCircle size={20} className="text-red-500" />
            ) : (
              <Link2Off size={20} className="text-[var(--color-text-secondary)]" />
            )}
            <div>
              <p className="font-medium">
                {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Not Connected'}
              </p>
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
            </div>
          </div>

          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting || !config.botToken || !config.chatId}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
              ${isConnected
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'bg-[var(--color-primary)] text-white hover:opacity-90'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isConnected ? (
              <>
                <Link2Off size={16} />
                Disconnect
              </>
            ) : (
              <>
                <Link size={16} />
                Connect
              </>
            )}
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        {/* Bot Token */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Bot Token</label>
          <input
            type="password"
            value={config.botToken}
            onChange={(e) => setConfig({ botToken: e.target.value })}
            placeholder="Enter your Telegram bot token"
            className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            Get a token from @BotFather on Telegram
          </p>
        </div>

        {/* Chat ID */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Chat ID</label>
          <input
            type="text"
            value={config.chatId}
            onChange={(e) => setConfig({ chatId: e.target.value })}
            placeholder="Your Telegram chat ID"
            className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            Use @userinfobot to find your chat ID
          </p>
        </div>

        {/* Allowed Users */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Allowed Users</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {config.allowedUsers.map((user) => (
              <div
                key={user}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--color-surface-dim)] border border-[var(--color-border)]"
              >
                <span className="text-sm">@{user}</span>
                <button
                  onClick={() => handleRemoveUser(user)}
                  className="text-[var(--color-text-secondary)] hover:text-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {config.allowedUsers.length === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No users added yet
              </p>
            )}
          </div>

          {showAddUser ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                placeholder="Telegram username"
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              <button
                onClick={handleAddUser}
                className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddUser(false)}
                className="px-4 py-2 rounded-lg hover:bg-[var(--color-surface-dim)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
            >
              <Plus size={14} />
              Add user
            </button>
          )}
        </div>
      </div>

      {/* Test Message */}
      {isConnected && (
        <div className="mt-6 p-4 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)]">
          <h3 className="font-medium mb-3">Test Message</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Send a test message..."
              className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <button
              onClick={handleSendTest}
              disabled={!testMessage.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </div>
      )}

      {/* Message History */}
      {messages.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Message History</h3>
            <button
              onClick={clearMessages}
              className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-red-500"
            >
              <Trash2 size={14} />
              Clear
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="p-3 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{msg.from}</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{msg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commands Info */}
      <div className="mt-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <h3 className="font-medium text-blue-500 mb-2">Available Commands</h3>
        <ul className="text-sm space-y-1 text-[var(--color-text-secondary)]">
          <li><code className="px-1 bg-[var(--color-surface-dim)] rounded">/status</code> - Check Snotra status</li>
          <li><code className="px-1 bg-[var(--color-surface-dim)] rounded">/chat</code> - Start a new conversation</li>
          <li><code className="px-1 bg-[var(--color-surface-dim)] rounded">/approve</code> - Approve pending permissions</li>
          <li><code className="px-1 bg-[var(--color-surface-dim)] rounded">/tasks</code> - List scheduled tasks</li>
          <li><code className="px-1 bg-[var(--color-surface-dim)] rounded">/help</code> - Show all commands</li>
        </ul>
      </div>
    </div>
  );
}