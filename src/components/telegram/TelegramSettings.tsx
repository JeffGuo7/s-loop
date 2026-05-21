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
    <div className="h-full flex overflow-hidden bg-bg">
      {/* Left Sidebar */}
      <aside className="w-72 bg-surface border-r border-border flex flex-col shrink-0">
        <div className="p-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 rounded-[22px] bg-accent-muted text-accent shadow-sm">
              <Bot size={26} />
            </div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Telegram</h2>
          </div>
          <p className="text-[12px] text-text-tertiary leading-relaxed font-bold uppercase tracking-[0.3em] opacity-60">
            Remote Orchestration
          </p>
        </div>

        <div className="flex-1 px-6 space-y-2">
          {[
            { id: 'config', icon: Shield, label: 'Configuration' },
            { id: 'history', icon: MessageSquare, label: 'Activity Log' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-5 px-6 py-5 rounded-[28px] text-[15px] font-bold tracking-tight transition-all duration-300 ${
                activeTab === item.id
                  ? 'bg-accent-muted text-accent shadow-sm'
                  : 'text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              <item.icon size={20} className={activeTab === item.id ? 'text-accent' : 'text-text-tertiary'} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-8">
          <Card className={`p-5 transition-all duration-500 border-none rounded-[28px] ${
            isConnected ? 'bg-green-500/10' : 'bg-surface-secondary'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-text-quaternary opacity-40'}`} />
              <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${
                isConnected ? 'text-green-600' : 'text-text-tertiary opacity-70'
              }`}>
                {isConnected ? 'System Online' : 'Service Offline'}
              </span>
            </div>
          </Card>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-bg">
        <header className="h-24 flex items-center justify-between px-12 shrink-0 bg-surface/50 backdrop-blur-xl border-b border-border-light z-10">
          <h3 className="text-xl font-bold text-text tracking-tight">
            {activeTab === 'config' ? 'Bot Configuration' : 'Activity Log'}
          </h3>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-surface-hover w-12 h-12"
          >
            <X size={24} />
          </Button>
        </header>

        <ScrollShadow className="flex-1 p-12">
          <div className="max-w-3xl mx-auto space-y-12 animate-fade-in">
            {activeTab === 'config' ? (
              <>
                {/* Connection Status Card */}
                <Card className="p-10 border-accent/10 shadow-2xl shadow-black/[0.02] overflow-visible rounded-[40px]">
                  <div className="flex items-center justify-between gap-10">
                    <div className="flex items-center gap-6">
                      <div className={`p-6 rounded-[32px] ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-surface-secondary text-text-tertiary'}`}>
                        {isConnected ? <Link size={32} /> : <Link2Off size={32} />}
                      </div>
                      <div>
                        <p className="font-bold text-2xl text-text tracking-tight">
                          {isConnected ? 'Connected to Telegram' : isConnecting ? 'Connecting...' : 'Disconnected'}
                        </p>
                        <p className="text-[14px] text-text-tertiary mt-2 font-medium leading-relaxed opacity-70">
                          {isConnected ? 'Actively listening for remote commands' : 'Configure and connect your bot to enable features'}
                        </p>
                      </div>
                    </div>
                    <MagicButton
                      onClick={isConnected ? disconnect : connect}
                      isDisabled={isConnecting || !config.botToken || !config.chatId}
                      className="min-w-[180px] h-14 rounded-[28px]"
                    >
                      {isConnecting ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : isConnected ? (
                        <>
                          <Link2Off size={20} strokeWidth={2.5} /> Disconnect
                        </>
                      ) : (
                        <>
                          <Link size={20} strokeWidth={2.5} /> Connect Bot
                        </>
                      )}
                    </MagicButton>
                  </div>
                  {error && (
                    <div className="mt-8 p-6 rounded-[28px] bg-red-500/10 border border-red-500/15 flex items-center gap-4 text-sm text-red-500 font-bold">
                      <Info size={20} />
                      {error}
                    </div>
                  )}
                </Card>

                {/* Form Section */}
                <div className="space-y-10">
                  <div className="grid grid-cols-1 gap-10">
                    <div className="space-y-4">
                      <label className="text-[12px] font-bold uppercase tracking-[0.4em] text-text-tertiary ml-2 opacity-70">Security Token</label>
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
                      <p className="text-[11px] text-text-tertiary ml-2 mt-2 font-bold italic opacity-60">
                        Obtain via <a href="https://t.me/BotFather" target="_blank" className="text-accent hover:underline">@BotFather</a>
                      </p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[12px] font-bold uppercase tracking-[0.4em] text-text-tertiary ml-2 opacity-70">Admin Identity</label>
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
                      <p className="text-[11px] text-text-tertiary ml-2 mt-2 font-bold italic opacity-60">
                        Retrieve via <a href="https://t.me/userinfobot" target="_blank" className="text-accent hover:underline">@userinfobot</a>
                      </p>
                    </div>
                  </div>

                  <div className="w-full h-px bg-border-light my-4 opacity-50" />

                  <div className="space-y-6">
                    <label className="text-[12px] font-bold uppercase tracking-[0.4em] text-text-tertiary ml-2 opacity-70">Access Control: Authorized Users</label>
                    <div className="flex flex-wrap gap-3 p-8 rounded-[40px] bg-surface-secondary/50 border border-border-light min-h-[100px] items-center">
                      {config.allowedUsers.map((user) => (
                        <div
                          key={user}
                          className="flex items-center gap-3 px-5 py-2 rounded-full bg-accent-muted text-accent font-bold text-[13px] border border-accent/15 shadow-sm"
                        >
                          <span>@{user}</span>
                          <button
                            onClick={() => handleRemoveUser(user)}
                            className="hover:text-red-500 transition-colors p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {config.allowedUsers.length === 0 && (
                        <p className="text-[14px] text-text-tertiary italic mx-auto font-bold opacity-40">
                          No users have been authorized yet
                        </p>
                      )}
                    </div>

                    {showAddUser ? (
                      <div className="flex gap-4 animate-slide-up">
                        <Input
                          autoFocus
                          value={newUser}
                          onChange={(e) => setNewUser(e.target.value)}
                          placeholder="Username (without @)"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                          size="md"
                          variant="primary"
                        />
                        <Button onClick={handleAddUser} variant="primary" size="md" className="px-10 h-14 rounded-[28px]">Add</Button>
                        <Button onClick={() => setShowAddUser(false)} variant="ghost" size="md" className="px-8">Cancel</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddUser(true)}
                        className="flex items-center gap-4 text-[12px] text-accent font-bold uppercase tracking-[0.4em] hover:opacity-80 transition-all ml-2 group"
                      >
                        <div className="p-1.5 rounded-full bg-accent-muted group-hover:bg-accent group-hover:text-white transition-all shadow-sm">
                          <Plus size={18} strokeWidth={3} />
                        </div>
                        Add Authorized User
                      </button>
                    )}
                  </div>
                </div>

                {/* Test Section */}
                {isConnected && (
                  <div className="pt-12 mt-6 border-t border-border-light">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 ml-2">
                        <div className="w-2 h-5 rounded-full bg-accent/30" />
                        <span className="text-[12px] font-bold uppercase tracking-[0.4em] text-text-tertiary">System Integrity Test</span>
                      </div>
                      <div className="flex gap-5">
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
                          className="px-10 h-14 rounded-[28px] shadow-2xl shadow-accent/20"
                          variant="primary"
                        >
                          <Send size={20} strokeWidth={2.5} />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-10">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-5 rounded-full bg-accent/30" />
                    <span className="text-[12px] font-bold uppercase tracking-[0.4em] text-text-tertiary">Process History</span>
                  </div>
                  {messages.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearMessages} className="text-red-500 font-bold hover:bg-red-500/10 px-6 rounded-2xl h-10">
                      <Trash2 size={16} /> Purge Logs
                    </Button>
                  )}
                </div>

                {messages.length > 0 ? (
                  <div className="space-y-6">
                    {messages.map((msg) => (
                      <Card key={msg.id} className="p-8 bg-surface-secondary/40 border-border-light hover:border-accent/20 transition-all duration-500 rounded-[32px] hover:shadow-xl hover:shadow-black/[0.02] hover:-translate-y-1">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center shadow-sm">
                              <Bot size={16} className="text-accent" />
                            </div>
                            <span className="text-[14px] font-bold text-text tracking-tight">@{msg.from}</span>
                          </div>
                          <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-[0.2em] bg-bg px-3 py-1.5 rounded-xl border border-border-light shadow-xs">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[15px] text-text-secondary leading-relaxed font-bold opacity-80 pl-11">{msg.text}</p>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="py-32 flex flex-col items-center justify-center opacity-40 text-center animate-fade-in">
                    <div className="p-10 rounded-[48px] bg-surface-secondary mb-8 shadow-inner">
                      <MessageSquare size={64} className="text-text-tertiary" />
                    </div>
                    <p className="text-xl font-bold text-text tracking-tight">Quiet Environment</p>
                    <p className="text-sm mt-3 font-bold opacity-60">Remote command logs will materialize here</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollShadow>

        {/* Info Footer */}
        <footer className="px-12 py-10 border-t border-border-light bg-surface/30 backdrop-blur-md">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-8">
            <div className="flex items-center gap-4 text-[11px] font-bold text-text-tertiary uppercase tracking-[0.3em]">
              <Info size={18} strokeWidth={2.5} className="text-accent opacity-60" />
              Orchestration Commands
            </div>
            <div className="flex gap-4">
              {['/status', '/chat', '/approve', '/tasks'].map(cmd => (
                <code key={cmd} className="px-4 py-2 rounded-xl bg-bg border border-border-light text-[11px] text-accent font-black shadow-sm hover:border-accent/30 hover:bg-accent-subtle transition-all cursor-default">
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
