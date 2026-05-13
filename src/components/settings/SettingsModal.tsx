import { useState } from 'react';
import { useAppStore } from '../../stores';
import { X, Key, Globe, Cpu, Save, Eye, EyeOff, Server, Sparkles } from 'lucide-react';
import type { ProviderKind, ProviderConfig } from '../../types';
import { MCPSettings } from '../mcp';
import { SkillSettings } from '../skills';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    activeProvider,
    setActiveProvider,
    providerConfigs,
    setProviderConfig,
    theme,
    setTheme,
  } = useAppStore();

  const [showApiKey, setShowApiKey] = useState(false);
  const [localConfigs, setLocalConfigs] = useState(providerConfigs);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'provider' | 'mcp' | 'skills'>('provider');

  const handleConfigChange = (
    provider: ProviderKind,
    field: keyof ProviderConfig,
    value: string
  ) => {
    setLocalConfigs((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    Object.entries(localConfigs).forEach(([provider, config]) => {
      setProviderConfig(provider as ProviderKind, config);
    });
    setHasChanges(false);
    // Show save success feedback
  };

  const models: Record<ProviderKind, string[]> = {
    anthropic: [
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
    ],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[80vh] bg-[var(--color-surface)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-surface-dim)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)] space-y-6">
          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-[var(--color-border)] pb-2">
            <button
              onClick={() => setActiveTab('provider')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
                activeTab === 'provider'
                  ? 'bg-[var(--color-surface-dim)] border-b-2 border-[var(--color-primary)]'
                  : 'hover:bg-[var(--color-surface-dim)]'
              }`}
            >
              <Cpu size={16} />
              AI Provider
            </button>
            <button
              onClick={() => setActiveTab('mcp')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
                activeTab === 'mcp'
                  ? 'bg-[var(--color-surface-dim)] border-b-2 border-[var(--color-primary)]'
                  : 'hover:bg-[var(--color-surface-dim)]'
              }`}
            >
              <Server size={16} />
              MCP Servers
            </button>
            <button
              onClick={() => setActiveTab('skills')}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
                activeTab === 'skills'
                  ? 'bg-[var(--color-surface-dim)] border-b-2 border-[var(--color-primary)]'
                  : 'hover:bg-[var(--color-surface-dim)]'
              }`}
            >
              <Sparkles size={16} />
              Skills
            </button>
          </div>

          {/* Theme Setting */}
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
              Appearance
            </h3>
            <div className="flex items-center justify-between p-4 bg-[var(--color-surface-dim)] rounded-lg">
              <span>Theme</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme('light')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    theme === 'light'
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    theme === 'dark'
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>
          </section>

          {/* Provider Settings */}
          {activeTab === 'provider' && (
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
              AI Provider
            </h3>

            {/* Provider Tabs */}
            <div className="flex gap-2 mb-4">
              {(['anthropic', 'openai'] as ProviderKind[]).map((provider) => (
                <button
                  key={provider}
                  onClick={() => setActiveProvider(provider)}
                  className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                    activeProvider === provider
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-dim)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  {provider}
                </button>
              ))}
            </div>

            {/* Provider Config Form */}
            {(['anthropic', 'openai'] as ProviderKind[]).map((provider) => (
              <div
                key={provider}
                className={`space-y-4 ${
                  activeProvider === provider ? 'block' : 'hidden'
                }`}
              >
                {/* API Key */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Key size={16} />
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={localConfigs[provider].apiKey}
                      onChange={(e) =>
                        handleConfigChange(provider, 'apiKey', e.target.value)
                      }
                      placeholder={`Enter your ${provider} API key`}
                      className="w-full px-4 py-2 pr-10 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                    >
                      {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Cpu size={16} />
                    Model
                  </label>
                  <select
                    value={localConfigs[provider].model}
                    onChange={(e) =>
                      handleConfigChange(provider, 'model', e.target.value)
                    }
                    className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
                  >
                    {models[provider].map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Base URL (Optional) */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Globe size={16} />
                    Base URL
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      (Optional, for custom endpoints)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={localConfigs[provider].baseUrl || ''}
                    onChange={(e) =>
                      handleConfigChange(provider, 'baseUrl', e.target.value)
                    }
                    placeholder={`https://api.${provider}.com`}
                    className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>
            ))}
          </section>
          )}

          {/* MCP Settings */}
          {activeTab === 'mcp' && <MCPSettings />}

          {/* Skills Settings */}
          {activeTab === 'skills' && <SkillSettings />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-dim)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
