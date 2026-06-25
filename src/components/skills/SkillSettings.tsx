import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Sparkles,
  Plus,
  Trash2,
  Power,
  PowerOff,
  ChevronDown,
  FolderOpen,
  FileCode,
  RefreshCw,
  Loader2,
  Upload,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { useSkillStore, useAppStore } from '../../stores';
import type { SkillInfo } from '../../types/skill';
import { CopyButton } from '../chat/shared/CopyButton';

type SkillView = 'list' | 'add' | 'paths';

export function SkillSettings() {
  const { t } = useTranslation();
  const {
    skills,
    paths,
    isScanning,
    lastScanTime,
    scanError,
    removeSkill,
    toggleSkill,
    addPath,
    removePath,
    refreshSkills,
    clearScanError,
    installSkillZip,
  } = useSkillStore();
  const githubMirror = useAppStore((s) => s.githubMirror);
  const npmRegistryMirror = useAppStore((s) => s.npmRegistryMirror);
  const setGithubMirror = useAppStore((s) => s.setGithubMirror);
  const setNpmRegistryMirror = useAppStore((s) => s.setNpmRegistryMirror);
  const [currentView, setCurrentView] = useState<SkillView>('list');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [dropInstalling, setDropInstalling] = useState(false);
  const [dropInstalled, setDropInstalled] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="space-y-8 animate-slide-up">
      {currentView === 'list' && (
      <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t('skills.title')}</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            <span className="font-semibold text-[var(--color-accent)]">{enabledCount}</span> {t('skills.activeCount', { n: enabledCount, m: skills.length })}
          </p>
          {lastScanTime && (
            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 opacity-60">
              {t('skills.lastScan')}: {new Date(lastScanTime).toLocaleString()}
            </p>
          )}
          {scanError && (
            <p className="text-xs text-[var(--color-error)] mt-1 flex items-center gap-1">
              <span>⚠</span> {scanError}
              <button onClick={clearScanError} className="ml-1 underline opacity-70 hover:opacity-100">Dismiss</button>
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setCurrentView('paths')}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <FolderOpen className="w-4 h-4" />
            {t('skills.paths')}
          </button>
          <button
            onClick={() => { clearScanError(); refreshSkills(); }}
            disabled={isScanning}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
            title={lastScanTime ? `Last scanned: ${new Date(lastScanTime).toLocaleTimeString()}` : 'Scan for skills'}
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('skills.scan')}
          </button>
          <button
            onClick={() => document.getElementById('skill-zip-input')?.click()}
            className="btn-secondary flex items-center gap-2 text-sm"
            title={t('skills.installFromZip')}
          >
            {dropInstalling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('skills.installFromZip')}
          </button>
          <button
            onClick={() => setCurrentView('add')}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('skills.addSkill')}
          </button>
        </div>
      </div>

      <input
        type="file"
        accept=".zip"
        className="hidden"
        id="skill-zip-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          setDropError(null);
          setDropInstalled(false);
          setDropInstalling(true);

          try {
            const bytes = await file.arrayBuffer();
            const zipBase64 = arrayBufferToBase64(bytes);
            await installSkillZip(zipBase64);

            setDropInstalled(true);
            setTimeout(() => setDropInstalled(false), 2000);
          } catch (err) {
            setDropError(err instanceof Error ? err.message : t('skills.zipParseError'));
          } finally {
            setDropInstalling(false);
          }

          e.target.value = '';
        }}
      />

      {dropInstalled && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 text-sm text-[var(--color-success)] font-bold animate-fade-in">
          <Check className="w-4 h-4" />
          {t('skills.installed')}
        </div>
      )}
      {dropError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 text-sm text-[var(--color-error)] animate-fade-in">
          <span>⚠</span> {dropError}
          <button onClick={() => setDropError(null)} className="ml-auto text-[10px] underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)]/50">
          <div className="w-16 h-16 bg-[var(--color-accent-muted)] rounded-full flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-[var(--color-accent)] opacity-80" />
          </div>
          <h4 className="text-lg font-semibold text-[var(--color-text)]">{t('skills.emptyTitle')}</h4>
          <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-xs mt-2">
            {t('skills.emptyDesc')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {skills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              expanded={expandedSkill === skill.name}
              onToggleExpand={() =>
                setExpandedSkill(expandedSkill === skill.name ? null : skill.name)
              }
              onToggle={() => toggleSkill(skill.name)}
              onRemove={() => removeSkill(skill.name)}
            />
          ))}
        </div>
      )}

      {/* Mirror settings */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h4 className="text-sm font-semibold text-[var(--color-text)] mb-1">{t('skills.mirrorTitle')}</h4>
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">{t('skills.mirrorDesc')}</p>
        <div className="grid gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('skills.githubMirror')}</label>
            <input
              type="url"
              value={githubMirror}
              onChange={(e) => setGithubMirror(e.target.value)}
              placeholder={t('skills.githubMirrorPlaceholder')}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('skills.npmRegistryMirror')}</label>
            <input
              type="url"
              value={npmRegistryMirror}
              onChange={(e) => setNpmRegistryMirror(e.target.value)}
              placeholder={t('skills.npmRegistryMirrorPlaceholder')}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            />
          </div>
        </div>
      </div>
      </>
      )}

      {currentView === 'add' && <AddSkillView onBack={() => setCurrentView('list')} />}
      {currentView === 'paths' && <SkillPathsView paths={paths} addPath={addPath} removePath={removePath} onBack={() => setCurrentView('list')} />}
    </div>
  );
}

interface SkillCardProps {
  skill: SkillInfo;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  onRemove: () => void;
}

function SkillCard({ skill, expanded, onToggleExpand, onToggle, onRemove }: SkillCardProps) {
  const { t } = useTranslation();
  const skillMeta = useSkillStore((s) => s.skillMeta);
  return (
    <div
      className={`group transition-all duration-300 border ${
        expanded
          ? 'border-[var(--color-accent)] shadow-md'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent-light)]'
      } rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface)]`}
    >
      <div
        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
          expanded ? 'bg-[var(--color-accent-muted)]' : 'hover:bg-[var(--color-surface-secondary)]'
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-colors ${
            skill.enabled ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)]'
          }`}>
            {skillMeta[skill.name]?.emoji || '📋'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--color-text)] truncate">{skill.name}</span>
              {skill.location === 'builtin' && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-bold rounded-md">
                  {t('skills.builtin')}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
              {skill.description || t('skills.noDescription')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              skill.enabled
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20'
                : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]'
            }`}
          >
            {skill.enabled ? (
              <><Power className="w-3.5 h-3.5" /> {t('skills.active')}</>
            ) : (
              <><PowerOff className="w-3.5 h-3.5" /> {t('skills.disabled')}</>
            )}
          </button>

          <div className="w-[1px] h-6 bg-[var(--color-border)]" />

          {skill.location !== 'builtin' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="btn-ghost-danger"
              title={t('skills.remove')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <div className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-5 border-t border-[var(--color-border)] bg-[var(--color-surface)] animate-slide-up">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5 block">
                  {t('skills.location')}
                </label>
                <div className="flex items-center gap-2 text-sm font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-secondary)] p-2 rounded-lg">
                  <FolderOpen className="w-3.5 h-3.5" />
                  {skill.location}
                </div>
              </div>

              {skill.hooks && (skill.hooks.pre || skill.hooks.post) && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5 block">
                    {t('skills.executionHooks')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {skill.hooks.pre?.map((hook, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning)]/20 rounded-full font-medium"
                      >
                        pre: {hook}
                      </span>
                    ))}
                    {skill.hooks.post?.map((hook, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success)]/20 rounded-full font-medium"
                      >
                        post: {hook}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {skill.content && (
              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5 block">
                  {t('skills.instructionContent')}
                </label>
                <div className="flex-1 relative group/code">
                  <pre className="text-xs bg-[var(--color-surface-secondary)] p-4 rounded-xl overflow-auto max-h-48 font-mono leading-relaxed border border-[var(--color-border)]">
                    {skill.content}
                  </pre>
                  <div className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
                    <CopyButton text={skill.content} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddSkillView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { addSkill, clawhubSearch, clawhubInstall } = useSkillStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [remoteQuery, setRemoteQuery] = useState('');
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [clawhubResults, setClawhubResults] = useState<Array<{ slug: string; name: string; description: string; downloads: number; sourceType: string }>>([]);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const installingRef = useRef(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addSkill(name, description, content);
    onBack();
  };

  const handleRemoteSearch = async (query: string) => {
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const clawhub = await clawhubSearch(query);
      setClawhubResults(
        clawhub.map((r) => ({
          slug: r.slug,
          name: r.name,
          description: r.description,
          downloads: r.downloads ?? 0,
          sourceType: 'clawhub',
        }))
      );
    } catch (error: unknown) {
      console.error('[SkillSettings] Remote search failed:', error);
      setClawhubResults([]);
      const msg = (error instanceof Error)
        ? error.message
        : (typeof error === 'string' ? error : JSON.stringify(error));
      setRemoteError(msg || t('skills.remoteSearchError'));
    } finally {
      setRemoteLoading(false);
    }
  };

  const handleClawhubInstall = async (slug: string, skillName: string) => {
    if (installingRef.current) return;
    installingRef.current = true;
    setBusySlug(skillName);
    setRemoteError(null);
    try {
      const result = await clawhubInstall(slug, skillName);
      if (!result.success) {
        setRemoteError(result.message || t('skills.remoteInstallError'));
      } else {
        onBack();
      }
    } catch (error: unknown) {
      console.error('[SkillSettings] ClawHub install failed:', error);
      const msg = (error instanceof Error)
        ? error.message
        : (typeof error === 'string' ? error : JSON.stringify(error));
      setRemoteError(`${t('skills.remoteInstallError')}: ${msg}`);
    } finally {
      setBusySlug(null);
      installingRef.current = false;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
      >
        <ArrowLeft size={14} />
        {t('skills.backToList')}
      </button>

      <div>
        <h3 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t('skills.newSkill')}</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t('skills.newSkillDesc')}</p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/60 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[var(--color-text)]">{t('skills.remoteTitle')}</div>
            <div className="text-xs text-[var(--color-text-secondary)] mt-1">{t('skills.remoteDesc')}</div>
          </div>
          <a
            href="https://clawhub.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-[11px] font-bold text-[var(--color-accent)] hover:underline rounded-lg"
          >
            clawhub.ai ↗
          </a>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={remoteQuery}
            onChange={(e) => setRemoteQuery(e.target.value)}
            className="flex-1 px-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] transition-all outline-none text-sm"
            placeholder={t('skills.remoteSearchPlaceholder')}
          />
          <button
            type="button"
            onClick={() => handleRemoteSearch(remoteQuery)}
            className="btn-primary px-5"
          >
            {t('common.search')}
          </button>
        </div>

        <div className="mt-4 space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-subtle">
          {remoteLoading ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center text-sm text-[var(--color-text-secondary)]">
              {t('skills.remoteLoading')}
            </div>
          ) : remoteError ? (
            <div className="rounded-xl border border-[var(--color-error)]/20 bg-[var(--color-error-bg)] px-4 py-5 text-center text-sm text-[var(--color-error)]">
              {remoteError}
            </div>
          ) : clawhubResults.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center text-sm text-[var(--color-text-secondary)]">
              {t('skills.remoteEmpty')}
            </div>
          ) : (
            clawhubResults.map((item) => (
              <div key={`ch-${item.slug}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--color-text)] truncate">{item.name}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed line-clamp-2">
                      {item.description}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-[var(--color-accent-muted)] text-[var(--color-accent)]">
                        ClawHub
                      </span>
                      {item.downloads > 0 && (
                        <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]">
                          {item.downloads >= 1000 ? `${(item.downloads / 1000).toFixed(1)}K` : item.downloads} installs
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleClawhubInstall(item.slug, item.name)}
                    disabled={busySlug === item.name}
                    className="btn-primary px-4 py-2 text-xs flex-shrink-0 disabled:opacity-50"
                  >
                    {busySlug === item.name ? t('skills.installing') : t('skills.install')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('skills.skillName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] transition-all outline-none text-sm"
            placeholder={t('skills.skillPlaceholder')}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('skills.descriptionLabel')}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] transition-all outline-none text-sm"
            placeholder={t('skills.descPlaceholder')}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('skills.systemInstructions')}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] transition-all outline-none font-mono text-sm leading-relaxed"
            rows={6}
            placeholder={t('skills.instructionsPlaceholder')}
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            {t('skills.cancel')}
          </button>
          <button
            type="submit"
            className="btn-primary px-8"
          >
            {t('skills.createSkill')}
          </button>
        </div>
      </form>
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function SkillPathsView({ paths, addPath, removePath, onBack }: { paths: string[]; addPath: (path: string) => void; removePath: (path: string) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [newPath, setNewPath] = useState('');

  const handleAddPath = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPath.trim()) {
      addPath(newPath.trim());
      setNewPath('');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
      >
        <ArrowLeft size={14} />
        {t('skills.backToList')}
      </button>

      <div>
        <h3 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t('skills.skillPaths')}</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t('skills.skillPathsDesc')}</p>
      </div>

      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-subtle">
        {paths.length === 0 ? (
          <div className="text-center py-8 bg-[var(--color-surface-secondary)] rounded-xl border border-dashed border-[var(--color-border)]">
            <FolderOpen className="w-8 h-8 text-[var(--color-text-tertiary)] mx-auto mb-2 opacity-50" />
            <p className="text-sm text-[var(--color-text-tertiary)]">{t('skills.noPaths')}</p>
          </div>
        ) : (
          paths.map((path: string) => (
            <div
              key={path}
              className="flex items-center justify-between p-3 bg-[var(--color-surface-secondary)] rounded-xl border border-[var(--color-border)] group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 bg-[var(--color-surface)] rounded-lg shadow-sm">
                  <FileCode className="w-4 h-4 text-[var(--color-accent)]" />
                </div>
                <span className="text-sm font-mono text-[var(--color-text-secondary)] truncate">{path}</span>
              </div>
              <button
                onClick={() => removePath(path)}
                className="btn-ghost-danger"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <button
        onClick={async () => {
          try {
            const selected = await open({
              directory: true,
              multiple: false,
              title: t('skills.selectFolder'),
            });
            if (selected) {
              addPath(selected);
            }
          } catch {
            // Tauri dialog not available — user can type manually
          }
        }}
        className="w-full flex items-center justify-center gap-3 py-4 bg-[var(--color-surface-secondary)] border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)] rounded-xl text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-all"
      >
        <FolderOpen className="w-5 h-5" />
        {t('skills.browseFolder')}
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[var(--color-border)]" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] opacity-50">
          {t('skills.orManual')}
        </span>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      <form onSubmit={handleAddPath} className="flex gap-2">
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          className="flex-1 px-4 py-2.5 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
          placeholder={t('skills.pathPlaceholder')}
        />
        <button
          type="submit"
          className="btn-primary"
        >
          {t('skills.add')}
        </button>
      </form>

      <div className="flex justify-end">
        <button
          onClick={onBack}
          className="btn-secondary w-full"
        >
          {t('skills.done')}
        </button>
      </div>
    </div>
  );
}
