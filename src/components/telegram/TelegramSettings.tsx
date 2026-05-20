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
  Shield,
  Bot,
  Info,
} from 'lucide-react';
import { Button, Card, Input } from '../ui';
import { MagicButton } from '../ui/MagicButton';
import { ScrollShadow } from "@heroui/react";

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

  const [activeTab, setActiveTab] = useState('config');
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
    <div className="h-full flex overflow-hidden bg-(--color-bg)">
      {/* Left Sidebar */}
      <aside className="w-64 bg-(--color-surface) border-r border-(--color-border) flex flex-col shrink-0">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-(--color-accent-muted) text-(--color-accent) shadow-sm">
              <Bot size={22} />
            </div>
            <h2 className="text-xl font-bold text-(--color-text) tracking-tight">Telegram</h2>
          </div>
          <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed font-medium uppercase tracking-widest opacity-60">
            Remote Orchestration
          </p>
        </div>

        <div className="flex-1 px-4 space-y-1">
          {[
            { id: 'config', icon: Shield, label: 'Configuration' },
            { id: 'history', icon: MessageSquare, label: 'Activity Log' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-[20px] text-sm font-bold tracking-tight transition-all duration-300 ${
                activeTab === item.id
                  ? 'bg-(--color-accent-muted) text-(--color-accent)'
                  : 'text-(--color-text-secondary) hover:bg-(--color-surface-secondary)'
              }`}
            >
              <item.icon size={18} className={activeTab === item.id ? 'text-(--color-accent)' : 'text-(--color-text-tertiary)'} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          <Card className={`p-4 transition-all duration-500 border-none ${
            isConnected ? 'bg-green-500/5' : 'bg-(--color-surface-secondary)'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-(--color-text-quaternary)'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${
                isConnected ? 'text-green-600' : 'text-(--color-text-tertiary)'
              }`}>
                {isConnected ? 'System Online' : 'Service Offline'}
              </span>
            </div>
          </Card>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-(--color-bg)">
        <header className="h-20 flex items-center justify-between px-10 shrink-0 bg-(--color-surface)/50 backdrop-blur-xl border-b border-(--color-border-light) z-10">
          <h3 className="text-lg font-bold text-(--color-text) tracking-tight">
            {activeTab === 'config' ? 'Bot Configuration' : 'Activity Log'}
          </h3>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-(--color-surface-hover)"
          >
            <X size={20} />
          </Button>
        </header>

        <ScrollShadow className="flex-1 p-10">
          <div className="max-w-2xl mx-auto space-y-10 animate-fade-in">
            {activeTab === 'config' ? (
              <>
                {/* Connection Status Card */}
                <Card className="p-8 border-(--color-accent)/10 shadow-lg shadow-black/[0.02] overflow-visible">
                  <div className="flex items-center justify-between gap-8">
                    <div className="flex items-center gap-5">
                      <div className={`p-4 rounded-[24px] ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-(--color-surface-secondary) text-(--color-text-tertiary)'}`}>
                        {isConnected ? <Link size={28} /> : <Link2Off size={28} />}
                      </div>
                      <div>
                        <p className="font-bold text-lg text-(--color-text) tracking-tight">
                          {isConnected ? 'Connected to Telegram' : isConnecting ? 'Connecting...' : 'Disconnected'}
                        </p>
                        <p className="text-xs text-(--color-text-tertiary) mt-1 font-medium">
                          {isConnected ? 'Actively listening for remote commands' : 'Configure and connect your bot to enable features'}
                        </p>
                      </div>
                    </div>
                    <MagicButton
                      onClick={isConnected ? disconnect : connect}
                      isDisabled={isConnecting || !config.botToken || !config.chatId}
                      className="min-w-[160px]"
                    >
                      {isConnecting ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : isConnected ? (
                        <>
                          <Link2Off size={18} strokeWidth={2.5} /> Disconnect
                        </>
                      ) : (
                        <>
                          <Link size={18} strokeWidth={2.5} /> Connect Bot
                        </>
                      )}
                    </MagicButton>
                  </div>
                  {error && (
                    <div className="mt-6 p-4 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center gap-3 text-xs text-red-500 font-medium">
                      <Info size={16} />
                      {error}
                    </div>
                  )}
                </Card>

                {/* Form Section */}
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-3">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1 opacity-70">Security Token</label>
                      <Input
                        type="password"
                        value={config.botToken}
                        onChange={(e) => setConfig({ botToken: e.target.value })}
                        placeholder="Enter your Telegram bot token..."
                        className="font-mono"
                        size="lg"
                        variant="primary"
                        isDisabled={isConnected || isConnecting}
                      />
                      <p className="text-[10px] text-(--color-text-tertiary) ml-1 mt-1 font-medium italic opacity-60">
                        Obtain via <a href="https://t.me/BotFather" target="_blank" className="text-(--color-accent) hover:underline">@BotFather</a>
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1 opacity-70">Admin Identity</label>
                      <Input
                        type="text"
                        value={config.chatId}
                        onChange={(e) => setConfig({ chatId: e.target.value })}
                        placeholder="Your unique Telegram chat ID..."
                        className="font-mono"
                        size="lg"
                        variant="primary"
                        isDisabled={isConnected || isConnecting}
                      />
                      <p className="text-[10px] text-(--color-text-tertiary) ml-1 mt-1 font-medium italic opacity-60">
                        Retrieve via <a href="https://t.me/userinfobot" target="_blank" className="text-(--color-accent) hover:underline">@userinfobot</a>
                      </p>
                    </div>
                  </div>

                  <div className="w-full h-px bg-(--color-border-light) my-2 opacity-50" />

                  <div className="space-y-4">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1 opacity-70">Access Control: Authorized Users</label>
                    <div className="flex flex-wrap gap-2.5 p-6 rounded-[28px] bg-(--color-surface-secondary)/50 border border-(--color-border-light) min-h-[80px] items-center">
                      {config.allowedUsers.map((user) => (
                        <div
                          key={user}
                          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-(--color-accent-muted) text-(--color-accent) font-bold text-xs border border-(--color-accent)/10"
                        >
                          <span>@{user}</span>
                          <button
                            onClick={() => handleRemoveUser(user)}
                            className="hover:text-red-500 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {config.allowedUsers.length === 0 && (
                        <p className="text-xs text-(--color-text-tertiary) italic mx-auto font-medium opacity-40">
                          No users have been authorized yet
                        </p>
                      )}
                    </div>

                    {showAddUser ? (
                      <div className="flex gap-3 animate-slide-up">
                        <Input
                          autoFocus
                          value={newUser}
                          onChange={(e) => setNewUser(e.target.value)}
                          placeholder="Username (without @)"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                          size="md"
                          variant="primary"
                        />
                        <Button onClick={handleAddUser} variant="primary" size="md" className="px-8">Add</Button>
                        <Button onClick={() => setShowAddUser(false)} variant="ghost" size="md">Cancel</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddUser(true)}
                        className="flex items-center gap-2.5 text-[11px] text-(--color-accent) font-bold uppercase tracking-widest hover:opacity-80 transition-all ml-1 group"
                      >
                        <div className="p-1 rounded-full bg-(--color-accent-muted) group-hover:bg-(--color-accent) group-hover:text-white transition-all">
                          <Plus size={14} strokeWidth={3} />
                        </div>
                        Add Authorized User
                      </button>
                    )}
                  </div>
                </div>

                {/* Test Section */}
                {isConnected && (
                  <div className="pt-8 mt-4 border-t border-(--color-border-light)">
                    <div className="space-y-5">
                      <div className="flex items-center gap-2.5 ml-1">
                        <div className="w-1.5 h-4 rounded-full bg-(--color-accent)/40" />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary)">System Integrity Test</span>
                      </div>
                      <div className="flex gap-4">
                        <Input
                          value={testMessage}
                          onChange={(e) => setTestMessage(e.target.value)}
                          placeholder="Send a secure test signal..."
                          size="lg"
                          variant="primary"
                        />
                        <Button
                          onClick={handleSendTest}
                          isDisabled={!testMessage.trim()}
                          className="px-8 h-12 shadow-lg shadow-accent/20"
                          variant="primary"
                        >
                          <Send size={18} strokeWidth={2.5} />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-4 rounded-full bg-(--color-accent)/40" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary)">Process History</span>
                  </div>
                  {messages.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearMessages} className="text-red-500 font-bold hover:bg-red-500/5 px-4">
                      <Trash2 size={14} /> Purge Logs
                    </Button>
                  )}
                </div>

                {messages.length > 0 ? (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <Card key={msg.id} className="p-5 bg-(--color-surface-secondary)/40 border-(--color-border-light) hover:border-(--color-accent)/20 transition-all duration-300">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-(--color-accent-muted) flex items-center justify-center">
                              <Bot size={12} className="text-(--color-accent)" />
                            </div>
                            <span className="text-xs font-bold text-(--color-text)">@{msg.from}</span>
                          </div>
                          <span className="text-[10px] font-bold text-(--color-text-tertiary) uppercase tracking-widest bg-(--color-bg) px-2 py-1 rounded-md border border-(--color-border-light)">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-(--color-text-secondary) leading-relaxed font-medium">{msg.text}</p>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="py-24 flex flex-col items-center justify-center opacity-40 text-center animate-fade-in">
                    <div className="p-6 rounded-[32px] bg-(--color-surface-secondary) mb-6">
                      <MessageSquare size={48} className="text-(--color-text-tertiary)" />
                    </div>
                    <p className="text-base font-bold text-(--color-text)">Quiet Environment</p>
                    <p className="text-xs mt-2 font-medium">Remote command logs will materialize here</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollShadow>

        {/* Info Footer */}
        <footer className="px-10 py-8 border-t border-(--color-border-light) bg-(--color-surface)/30 backdrop-blur-md">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 text-[10px] font-bold text-(--color-text-tertiary) uppercase tracking-[0.2em]">
              <Info size={14} strokeWidth={2.5} className="text-(--color-accent)" />
              Orchestration Commands
            </div>
            <div className="flex gap-3">
              {['/status', '/chat', '/approve', '/tasks'].map(cmd => (
                <code key={cmd} className="px-3 py-1.5 rounded-xl bg-(--color-bg) border border-(--color-border-light) text-[10px] text-(--color-accent) font-black shadow-xs hover:border-(--color-accent)/20 transition-all">
                  {cmd}
                </code>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
