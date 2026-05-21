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
    <div className="h-full flex overflow-hidden bg-transparent">
      {/* Left Sidebar - Integrated style */}
      <aside className="w-64 flex flex-col shrink-0 pt-8 pb-12">
        <div className="px-6 mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-accent/10 text-accent shadow-sm">
              <Bot size={22} />
            </div>
            <h2 className="text-xl font-bold text-text tracking-tighter">Telegram</h2>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-accent opacity-40">
            Remote Hub
          </p>
        </div>

        <div className="flex-1 px-4 space-y-1.5">
          {[
            { id: 'config', icon: Shield, label: 'Configuration' },
            { id: 'history', icon: MessageSquare, label: 'Activity Log' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-[14px] font-bold tracking-tight transition-all duration-500 border ${
                activeTab === item.id
                  ? 'bg-white dark:bg-white/10 border-accent/20 text-accent shadow-sm ring-1 ring-accent/5'
                  : 'text-text-secondary border-transparent hover:bg-surface-secondary/70'
              }`}
            >
              <item.icon size={16} className={activeTab === item.id ? 'text-accent' : 'text-text-tertiary'} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="px-6">
          <div className={`p-4 rounded-2xl border transition-all duration-500 ${
            isConnected 
              ? 'bg-green-500/5 border-green-500/10' 
              : 'bg-surface-secondary/50 border-border-light'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-text-quaternary opacity-30'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${
                isConnected ? 'text-green-600/80' : 'text-text-tertiary opacity-60'
              }`}>
                {isConnected ? 'Hub Active' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area - Integrated style */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent">
        <header className="h-20 flex items-center px-10 shrink-0 border-b border-border-light/50">
          <h3 className="text-[17px] font-black text-text tracking-tighter">
            {activeTab === 'config' ? 'Bot Configuration' : 'Activity Log'}
          </h3>
        </header>

        <ScrollShadow className="flex-1 px-10 py-10 custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-10 animate-fade-in-up">
            {activeTab === 'config' ? (
              <>
                {/* Connection Status Card */}
                <Card className="p-8 border-border-light/50 bg-white/50 dark:bg-white/5 backdrop-blur-xl rounded-[32px] shadow-sm">
                  <div className="flex items-center justify-between gap-8">
                    <div className="flex items-center gap-5">
                      <div className={`p-5 rounded-[24px] ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-surface-secondary text-text-tertiary'}`}>
                        {isConnected ? <Link size={24} /> : <Link2Off size={24} />}
                      </div>
                      <div>
                        <p className="font-bold text-lg text-text tracking-tight">
                          {isConnected ? 'Service Connected' : isConnecting ? 'Establishing...' : 'Not Connected'}
                        </p>
                        <p className="text-[12px] text-text-tertiary mt-1 font-medium opacity-60">
                          {isConnected ? 'Ready for remote orchestration' : 'Enter credentials to activate bot'}
                        </p>
                      </div>
                    </div>
                    <MagicButton
                      onClick={isConnected ? disconnect : connect}
                      isDisabled={isConnecting || !config.botToken || !config.chatId}
                      className="min-w-[140px] h-11 rounded-xl"
                    >
                      {isConnecting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : isConnected ? (
                        <span className="flex items-center gap-2"><Link2Off size={16} strokeWidth={2.5} /> Stop</span>
                      ) : (
                        <span className="flex items-center gap-2"><Link size={16} strokeWidth={2.5} /> Start Hub</span>
                      )}
                    </MagicButton>
                  </div>
                  {error && (
                    <div className="mt-6 p-4 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center gap-3 text-[13px] text-red-500 font-bold">
                      <Info size={16} />
                      {error}
                    </div>
                  )}
                </Card>

                {/* Form Section */}
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-1 opacity-50">Bot Token</label>
                      <Input
                        type="password"
                        value={config.botToken}
                        onChange={(e) => setConfig({ botToken: e.target.value })}
                        placeholder="7482910..."
                        className="font-mono h-12 rounded-xl"
                        variant="primary"
                        isDisabled={isConnected || isConnecting}
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-1 opacity-50">Admin Chat ID</label>
                      <Input
                        type="text"
                        value={config.chatId}
                        onChange={(e) => setConfig({ chatId: e.target.value })}
                        placeholder="12345678"
                        className="font-mono h-12 rounded-xl"
                        variant="primary"
                        isDisabled={isConnected || isConnecting}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-1 opacity-50">Authorized Personnel</label>
                    <div className="flex flex-wrap gap-2 p-6 rounded-[24px] bg-surface-secondary/30 border border-border-light/50 min-h-[80px] items-center">
                      {config.allowedUsers.map((user) => (
                        <div
                          key={user}
                          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent font-bold text-[12px] border border-accent/10"
                        >
                          <span>@{user}</span>
                          <button
                            onClick={() => handleRemoveUser(user)}
                            className="hover:text-red-500 transition-colors p-0.5"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {config.allowedUsers.length === 0 && (
                        <p className="text-[13px] text-text-tertiary italic mx-auto font-bold opacity-30">
                          No authorized users
                        </p>
                      )}
                    </div>

                    {showAddUser ? (
                      <div className="flex gap-3 animate-fade-in">
                        <Input
                          autoFocus
                          value={newUser}
                          onChange={(e) => setNewUser(e.target.value)}
                          placeholder="username"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                          className="h-11 rounded-xl"
                        />
                        <Button onClick={handleAddUser} variant="primary" className="px-6 h-11 rounded-xl font-bold">Add</Button>
                        <Button onClick={() => setShowAddUser(false)} variant="ghost" className="px-4 h-11 rounded-xl">Cancel</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddUser(true)}
                        className="flex items-center gap-3 text-[11px] text-accent font-bold uppercase tracking-[0.2em] hover:opacity-80 transition-all ml-1 group"
                      >
                        <div className="p-1 rounded-lg bg-accent/10 group-hover:bg-accent group-hover:text-white transition-all">
                          <Plus size={14} strokeWidth={3} />
                        </div>
                        Add Access
                      </button>
                    )}
                  </div>
                </div>

                {/* Test Section */}
                {isConnected && (
                  <div className="pt-8 border-t border-border-light/50">
                    <div className="space-y-4">
                      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-1 opacity-50">Signal Test</label>
                      <div className="flex gap-3">
                        <Input
                          value={testMessage}
                          onChange={(e) => setTestMessage(e.target.value)}
                          placeholder="Send encrypted signal..."
                          className="h-11 rounded-xl"
                        />
                        <Button
                          onClick={handleSendTest}
                          isDisabled={!testMessage.trim()}
                          className="px-6 h-11 rounded-xl shadow-lg shadow-accent/10"
                          variant="primary"
                        >
                          <Send size={16} strokeWidth={2.5} />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-1 opacity-50">Traffic Log</span>
                  {messages.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearMessages} className="text-red-500 font-bold hover:bg-red-500/5 px-4 rounded-xl h-8 text-[11px] uppercase tracking-wider">
                      Purge
                    </Button>
                  )}
                </div>

                {messages.length > 0 ? (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <Card key={msg.id} className="p-6 bg-white/40 dark:bg-white/5 border-border-light/50 hover:border-accent/20 transition-all duration-500 rounded-[24px] shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
                              <Bot size={14} className="text-accent" />
                            </div>
                            <span className="text-[13px] font-bold text-text tracking-tight">@{msg.from}</span>
                          </div>
                          <span className="text-[10px] font-bold text-text-tertiary bg-surface-secondary/50 px-2.5 py-1 rounded-lg">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[14px] text-text-secondary leading-relaxed font-medium pl-9">{msg.text}</p>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="py-24 flex flex-col items-center justify-center opacity-30 text-center animate-fade-in">
                    <div className="p-8 rounded-[40px] bg-surface-secondary/50 mb-6">
                      <MessageSquare size={48} className="text-text-tertiary" />
                    </div>
                    <p className="text-lg font-bold text-text tracking-tight">System Silent</p>
                    <p className="text-[12px] mt-1 font-bold">Inbound commands will appear here</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollShadow>

        {/* Info Footer */}
        <footer className="px-10 py-6 border-t border-border-light/50">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 text-[10px] font-bold text-text-tertiary uppercase tracking-[0.2em]">
              <Info size={14} strokeWidth={2.5} className="text-accent opacity-50" />
              Directives
            </div>
            <div className="flex gap-2">
              {['/status', '/chat', '/approve'].map(cmd => (
                <code key={cmd} className="px-3 py-1.5 rounded-lg bg-surface-secondary/50 border border-border-light/50 text-[10px] text-accent font-black">
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
