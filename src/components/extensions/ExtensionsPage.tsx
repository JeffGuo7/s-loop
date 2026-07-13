import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { Puzzle, Package, Download, Trash2, RefreshCw, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react'

interface ExtensionEntry {
  name: string
  loaded: boolean
  tools: { name: string; description: string }[]
}

function getBaseUrl() {
  try {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('snotra-storage') : null
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.state?.baseUrl || 'http://127.0.0.1:4096'
    }
  } catch {}
  return 'http://127.0.0.1:4096'
}

async function fetchExtensions(): Promise<ExtensionEntry[]> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/extensions`)
  if (!res.ok) throw new Error('Failed to fetch extensions')
  return res.json()
}

async function installExtension(pkg: string): Promise<{ loaded: boolean; packageName: string }> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/extensions/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: pkg }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Install failed')
  return data
}

async function removeExtension(pkg: string): Promise<void> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/extensions/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: pkg }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Remove failed')
}

export function ExtensionsPage() {
  const { t } = useTranslation()
  const [extensions, setExtensions] = useState<ExtensionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installPkg, setInstallPkg] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [removingPkg, setRemovingPkg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchExtensions()
      setExtensions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load extensions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleInstall = useCallback(async () => {
    const pkg = installPkg.trim()
    if (!pkg) return
    setInstalling(true)
    setInstallError(null)
    try {
      await installExtension(pkg)
      setInstallPkg('')
      await load()
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }, [installPkg, load])

  const handleRemove = useCallback(async (pkg: string) => {
    setRemovingPkg(pkg)
    try {
      await removeExtension(pkg)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setRemovingPkg(null)
    }
  }, [load])

  const handleRefresh = useCallback(() => {
    void load()
  }, [load])

  const totalTools = extensions.reduce((sum, ext) => sum + ext.tools.length, 0)
  const loadedCount = extensions.filter(e => e.loaded).length

  return (
    <div className="h-full flex overflow-hidden bg-transparent">
      {/* Left Sidebar */}
      <aside className="w-64 flex flex-col shrink-0 pt-8 pb-12">
        <div className="px-6 mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-accent/10 text-accent shadow-sm">
              <Puzzle size={22} />
            </div>
            <h2 className="text-xl font-bold text-text tracking-tighter">{t('sidebar.extensions')}</h2>
          </div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-accent opacity-40">
            Pi.dev Extensions
          </p>
        </div>

        {/* Stats */}
        <div className="px-6 mb-8 space-y-3">
          <div className="rounded-2xl border border-border-light/50 bg-white/60 dark:bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <Package size={16} className="text-accent" />
              <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">Status</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[13px]">
                <span className="text-text-secondary">Installed</span>
                <span className="font-bold text-text">{extensions.length}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-text-secondary">Loaded</span>
                <span className="font-bold text-text">{loadedCount}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-text-secondary">Tools</span>
                <span className="font-bold text-text">{totalTools}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-surface-secondary/70 hover:bg-surface-secondary text-text-secondary hover:text-text py-2.5 text-[12px] font-bold transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Install form */}
        <div className="px-4 mt-auto">
          <div className="rounded-2xl border border-border-light/50 bg-white/60 dark:bg-white/5 p-4 backdrop-blur-sm">
            <p className="text-[10px] font-black uppercase tracking-wider text-accent/60 mb-2">Install Package</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={installPkg}
                onChange={(e) => setInstallPkg(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInstall() }}
                placeholder="@scope/pi-extension-xxx"
                className="flex-1 rounded-xl bg-surface-secondary/80 border border-border-light/50 px-3 py-2 text-[12px] text-text placeholder:text-text-quaternary outline-none focus:border-accent/30 transition-all"
              />
              <button
                onClick={handleInstall}
                disabled={installing || !installPkg.trim()}
                className="rounded-xl bg-accent px-3 py-2 text-white disabled:opacity-40 hover:bg-accent/90 transition-all"
              >
                {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
            {installError && (
              <p className="mt-2 text-[10px] text-red-500 flex items-center gap-1">
                <AlertCircle size={10} />
                {installError}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-16 pb-12 px-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h3 className="text-[13px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-1">
              Installed Extensions
            </h3>
            <p className="text-[13px] text-text-secondary">
              Extensions register tools that the AI agent can call. Install packages from{' '}
              <a
                href="https://pi.dev/packages"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:text-accent/80 inline-flex items-center gap-0.5"
              >
                pi.dev/packages <ExternalLink size={10} />
              </a>
            </p>
          </div>

          {loading && extensions.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 mb-6">
              <div className="flex items-center gap-2 text-red-500 text-[13px]">
                <AlertCircle size={16} />
                <span className="font-bold">Error</span>
              </div>
              <p className="mt-1 text-[12px] text-red-400">{error}</p>
            </div>
          )}

          {!loading && extensions.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-accent/5 flex items-center justify-center mb-4">
                <Package size={28} className="text-accent/40" />
              </div>
              <h3 className="text-[17px] font-black text-text mb-2">No Extensions Installed</h3>
              <p className="text-[13px] text-text-tertiary max-w-sm">
                Install extensions from pi.dev to add new capabilities. Enter a package name in the sidebar to get started.
              </p>
            </div>
          )}

          {/* Extension list */}
          <div className="space-y-3">
            {extensions.map((ext) => (
              <div
                key={ext.name}
                className="rounded-2xl border border-border-light/50 bg-white/70 dark:bg-white/5 p-5 backdrop-blur-sm hover:border-border-hover transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-[14px] font-bold text-text truncate">{ext.name}</h4>
                      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        ext.loaded
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}>
                        {ext.loaded ? (
                          <><Check size={8} /> Loaded</>
                        ) : (
                          <><AlertCircle size={8} /> Not Loaded</>
                        )}
                      </span>
                    </div>

                    {/* Tools */}
                    {ext.tools.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-text-quaternary">
                          Tools ({ext.tools.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {ext.tools.map((tool) => (
                            <span
                              key={tool.name}
                              className="inline-flex items-center gap-1 rounded-lg bg-surface-secondary/80 px-2.5 py-1 text-[11px] font-medium text-text-secondary border border-border-light/30"
                              title={tool.description}
                            >
                              <Puzzle size={10} className="text-accent/60" />
                              {tool.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => handleRemove(ext.name)}
                    disabled={removingPkg === ext.name}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-40"
                  >
                    {removingPkg === ext.name ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
