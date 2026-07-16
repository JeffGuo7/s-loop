/**
 * extension-runtime.mjs — Pi Extension Runtime for s-loop
 *
 * Loads pi.dev packages into the pi-server so their registered
 * tools, commands, message renderers, and event handlers become
 * available to the AI agent and frontend.
 *
 * Each extension is an npm package whose default export is an
 * ExtensionFactory: (pi: ExtensionAPI) => void | Promise<void>
 *
 * This implementation mirrors the official pi ExtensionAPI surface
 * (from @earendil-works/pi-coding-agent) to maximise compatibility
 * with pi.dev packages.
 */

import { EventEmitter } from 'node:events'
import { execSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)
let _jiti = null
function getJiti() {
  if (!_jiti) {
    try {
      const jitiMod = _require('jiti')
      _jiti = jitiMod(import.meta.url, {
        moduleCache: false,
      })
    } catch (err) {
      console.warn('[extensions] jiti not available — .ts extensions will fail:', err.message)
    }
  }
  return _jiti
}

// ── Config ────────────────────────────────────────────────────

function resolveExtensionsDir() {
  const base = process.env.S_LOOP_PROJECT_DIR || process.env.SNOTRA_PROJECT_DIR || process.cwd()
  // Dev mode: pi-server lives under src-tauri/pi-server/
  const devCandidate = path.resolve(base, 'src-tauri', 'pi-server')
  if (fs.existsSync(path.join(devCandidate, 'index.mjs'))) {
    return path.join(devCandidate, 'extensions')
  }
  // Production / standalone: pi-server is at base/pi-server/
  return path.resolve(base, 'pi-server', 'extensions')
}

function resolveManifestPath() {
  return path.join(path.dirname(resolveExtensionsDir()), 'extensions-manifest.json')
}

const EXTENSIONS_DIR = resolveExtensionsDir()
const MANIFEST_PATH = resolveManifestPath()

console.log(`[extensions] dir=${EXTENSIONS_DIR} manifest=${MANIFEST_PATH}`)

// ── EventBus ──────────────────────────────────────────────────

/**
 * Simple EventBus wrapping Node EventEmitter.
 * Mirrors pi's createEventBus() from @earendil-works/pi-coding-agent.
 */
class EventBus {
  constructor() {
    this._emitter = new EventEmitter()
    this._emitter.setMaxListeners(100)
  }

  emit(channel, data) {
    this._emitter.emit(channel, data)
  }

  on(channel, handler) {
    const safeHandler = async (data) => {
      try {
        await handler(data)
      } catch (err) {
        console.error(`[event-bus] handler error on "${channel}":`, err)
      }
    }
    this._emitter.on(channel, safeHandler)
    return () => this._emitter.off(channel, safeHandler)
  }

  off(channel, handler) {
    this._emitter.off(channel, handler)
  }

  removeAllListeners(channel) {
    if (channel) {
      this._emitter.removeAllListeners(channel)
    } else {
      this._emitter.removeAllListeners()
    }
  }
}

const globalEventBus = new EventBus()

export function getEventBus() {
  return globalEventBus
}

// ── Internal state ────────────────────────────────────────────

const loadedExtensions = new Map()
let extensionTools = []

// ── Manifest persistence ──────────────────────────────────────

function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
    }
  } catch (err) {
    console.warn('[extensions] failed to load manifest:', err.message)
  }
  return { packages: [] }
}

function saveManifest(manifest) {
  try {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true })
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')
  } catch (err) {
    console.error('[extensions] failed to save manifest:', err.message)
  }
}

// ── npm helpers ───────────────────────────────────────────────

function ensurePackagesDir() {
  if (!fs.existsSync(EXTENSIONS_DIR)) {
    fs.mkdirSync(EXTENSIONS_DIR, { recursive: true })
  }
  const pkgPath = path.join(EXTENSIONS_DIR, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify({
      name: 's-loop-extensions',
      private: true,
      type: 'module',
    }, null, 2), 'utf-8')
  }
}

function resolvePackageEntry(packageName) {
  const pkgDir = path.join(EXTENSIONS_DIR, 'node_modules', packageName)
  const pkgJsonPath = path.join(pkgDir, 'package.json')
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))

      // Check pi.extensions field (pi.dev package convention)
      const piExtensions = pkgJson.pi?.extensions
      if (Array.isArray(piExtensions) && piExtensions.length > 0) {
        const extRelPath = piExtensions[0]
        const resolved = path.resolve(pkgDir, extRelPath)
        if (fs.existsSync(resolved)) {
          return { pkgDir, entryPath: resolved, pkgJson, isTs: resolved.endsWith('.ts') }
        }
      }

      // Try exports / main
      const entry = pkgJson.exports?.['.']?.import
        || pkgJson.exports?.['.']?.default
        || pkgJson.exports?.['.']
        || pkgJson.main
        || 'index.js'
      const resolved = path.resolve(pkgDir, typeof entry === 'string' ? entry : 'index.js')
      if (fs.existsSync(resolved)) return { pkgDir, entryPath: resolved, pkgJson, isTs: resolved.endsWith('.ts') }
    } catch {}
  }
  const fallback = path.join(pkgDir, 'index.js')
  if (fs.existsSync(fallback)) return { pkgDir, entryPath: fallback, pkgJson: null, isTs: false }
  throw new Error(`Cannot resolve entry point for package "${packageName}". Looked in ${pkgDir}`)
}

// ── ExtensionContext ──────────────────────────────────────────

/**
 * Build an ExtensionContext object for event handler calls.
 * Mirrors pi's ExtensionContext interface.
 */
export function createContext(overrides = {}) {
  return {
    mode: overrides.mode || 'rpc',
    hasUI: overrides.hasUI || false,
    cwd: overrides.cwd || process.cwd(),
    sessionManager: overrides.sessionManager || {
      getSessionId: () => overrides.sessionId || null,
      getSessionFile: () => overrides.sessionFile || null,
      getEntries: () => [],
      getEntryById: () => null,
    },
    modelRegistry: overrides.modelRegistry || { providers: [], getModel: () => null },
    model: overrides.model || undefined,
    isIdle: () => overrides.isIdle !== false,
    isProjectTrusted: () => true,
    signal: overrides.signal || undefined,
    abort: () => { if (overrides.abort) overrides.abort() },
    hasPendingMessages: () => false,
    shutdown: () => process.exit(0),
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => overrides.systemPrompt || '',
    ui: {
      setToolsExpanded: () => {},
      setWidget: () => {},
      openUrl: () => {},
      showNotification: () => {},
      setStatusBar: () => {},
    },
  }
}

// ── ExtensionAPI implementation ───────────────────────────────

class ExtensionRecord {
  constructor(packageName, sourceInfo) {
    this.packageName = packageName
    this.sourceInfo = sourceInfo
    this.tools = new Map()
    this.commands = new Map()
    this.shortcuts = new Map()
    this.flags = new Map()
    this.messageRenderers = new Map()
    this.entryRenderers = new Map()
    this.handlers = new Map()
    this.loaded = false
    this.factory = null
    this.toolList = []
  }
}

/**
 * Create an ExtensionAPI object for a given extension.
 */
function createExtensionAPI(record, eventBus) {
  const api = {
    // ── Event hooks ──
    on(event, handler) {
      const list = record.handlers.get(event) ?? []
      list.push(handler)
      record.handlers.set(event, list)
    },

    // ── Tool registration ──
    registerTool(toolDef) {
      if (!record.tools.has(toolDef.name)) {
        if (toolDef.parameters && !Array.isArray(toolDef.parameters.required)) {
          toolDef.parameters.required = []
        }
        const originalExecute = toolDef.execute
        if (originalExecute) {
          toolDef.execute = async (toolCallId, params, signal, onUpdate, ctx) => {
            const fallbackCtx = {
              ...ctx,
              mode: ctx?.mode || 'rpc',
              hasUI: ctx?.hasUI || false,
              cwd: ctx?.cwd || process.cwd(),
              sessionManager: ctx?.sessionManager || {
                getSessionId: () => null,
                getSessionFile: () => null,
                getEntries: () => [],
                getEntryById: () => null,
              },
              isIdle: () => true,
              isProjectTrusted: () => true,
              abort: () => {},
              shutdown: () => {},
              getSystemPrompt: () => '',
              ui: {
                setToolsExpanded: () => {},
                setWidget: () => {},
                openUrl: () => {},
                showNotification: () => {},
                setStatusBar: () => {},
              },
            }
            return originalExecute(toolCallId, params, signal, onUpdate, fallbackCtx)
          }
        }
        record.tools.set(toolDef.name, toolDef)
        const entry = { ...toolDef, _extension: record.packageName }
        record.toolList.push(entry)
        extensionTools.push(entry)
      }
    },

    // ── Command registration ──
    registerCommand(name, options) {
      record.commands.set(name, { name, sourceInfo: record.sourceInfo, ...options })
    },

    registerShortcut(shortcut, options) {
      record.shortcuts.set(shortcut, { shortcut, extensionPath: record.sourceInfo, ...options })
    },

    registerFlag(name, options) {
      record.flags.set(name, { name, extensionPath: record.sourceInfo, ...options })
      if (options.default !== undefined) {
        if (!api._flagValues) api._flagValues = new Map()
        if (!api._flagValues.has(name)) {
          api._flagValues.set(name, options.default)
        }
      }
    },

    getFlag(name) {
      if (!record.flags.has(name)) return undefined
      return api._flagValues?.get(name)
    },

    // ── Message renderers ──
    registerMessageRenderer(customType, renderer) {
      record.messageRenderers.set(customType, renderer)
    },

    registerEntryRenderer(customType, renderer) {
      record.entryRenderers.set(customType, renderer)
    },

    // ── Actions ──
    sendMessage(message, options) {
      globalEventBus.emit('extension:sendMessage', { packageName: record.packageName, message, options })
    },

    sendUserMessage(content, options) {
      globalEventBus.emit('extension:sendUserMessage', { packageName: record.packageName, content, options })
    },

    appendEntry(customType, data) {
      globalEventBus.emit('extension:appendEntry', { packageName: record.packageName, customType, data })
    },

    setSessionName(name) {
      globalEventBus.emit('extension:setSessionName', { packageName: record.packageName, name })
    },

    getSessionName() {
      return undefined
    },

    setLabel(entryId, label) {
      globalEventBus.emit('extension:setLabel', { packageName: record.packageName, entryId, label })
    },

    // ── Shell exec ──
    async exec(command, args, options) {
      const cwd = options?.cwd || process.cwd()
      const spawnOpts = { cwd, stdio: 'pipe', timeout: options?.timeout || 30000 }
      if (options?.env) spawnOpts.env = { ...process.env, ...options.env }
      try {
        const result = spawnSync(command, args || [], spawnOpts)
        return {
          exitCode: result.status ?? 1,
          stdout: result.stdout?.toString() || '',
          stderr: result.stderr?.toString() || '',
        }
      } catch (err) {
        return { exitCode: 1, stdout: '', stderr: err.message }
      }
    },

    // ── Tool queries ──
    getActiveTools() {
      return [...extensionTools.map(t => t.name)]
    },

    getAllTools() {
      return extensionTools.map(t => ({ name: t.name, description: t.description, tool: t }))
    },

    setActiveTools(toolNames) {
      // In s-loop all tools are always active; this is a no-op
    },

    getCommands() {
      const all = []
      for (const [, record] of loadedExtensions) {
        for (const [, cmd] of record.commands) {
          all.push(cmd)
        }
      }
      return all
    },

    // ── Model queries ──
    getModel() { return null },
    getModels() { return [] },
    setModel(id) {},

    // ── Thinking level ──
    getThinkingLevel() { return 'off' },
    setThinkingLevel(level) {},

    // ── Provider registration ──
    registerProvider(name, config) {},
    unregisterProvider(name) {},

    // ── UI (stub — no terminal UI in s-loop) ──
    ui: {
      select: async (opts) => { throw new Error('ui.select not available in s-loop') },
      confirm: async (msg) => { throw new Error('ui.confirm not available in s-loop') },
      input: async (opts) => { throw new Error('ui.input not available in s-loop') },
      notify: (msg) => { console.log(`[extensions:ui] ${msg}`) },
      setToolsExpanded: () => {},
      setWidget: () => {},
    },

    // ── Event bus (custom events) ──
    events: eventBus || globalEventBus,

    // ── Error callback ──
    onerror: (err) => { console.error(`[extensions] "${record.packageName}" error:`, err) },
  }
  return api
}

// ── Fire lifecycle events to all loaded extensions ────────────

function fireEvent(event, data = {}, ctxOverrides = {}) {
  const ctx = createContext(ctxOverrides)
  for (const [, record] of loadedExtensions) {
    const handlers = record.handlers.get(event)
    if (!handlers || handlers.length === 0) continue
    for (const handler of handlers) {
      try {
        handler(data, ctx)
      } catch (err) {
        console.error(`[extensions] "${record.packageName}" handler error on "${event}":`, err)
      }
    }
  }
}

/**
 * Fire a lifecycle event that the pi-server emits.
 * This is the bridge between pi-server events and extension handlers.
 */
export function fireExtensionEvent(event, data = {}, ctxOverrides = {}) {
  fireEvent(event, data, ctxOverrides)
}

// ── Core load / unload ────────────────────────────────────────

async function loadExtension(packageName, entryPath, pkgJson, isTs = false) {
  console.log(`[extensions] loading "${packageName}" from ${entryPath}${isTs ? ' (TypeScript)' : ''}`)

  const resolvedPath = path.resolve(entryPath)

  let factory
  if (isTs) {
    const jiti = getJiti()
    if (!jiti) {
      throw new Error(`Cannot load TypeScript extension "${packageName}": jiti not available. Install jiti in pi-server.`)
    }
    try {
      const mod = await jiti.import(resolvedPath, { default: true })
      factory = mod.default || mod
    } catch (err) {
      throw new Error(`Failed to import TypeScript extension "${packageName}": ${err.message}`)
    }
  } else {
    let mod
    try {
      mod = await import(resolvedPath + '?t=' + Date.now())
    } catch (err) {
      throw new Error(`Failed to import extension "${packageName}": ${err.message}`)
    }
    factory = mod.default || mod
  }

  if (typeof factory !== 'function') {
    throw new Error(`Extension "${packageName}" does not export a default factory function. Got: ${typeof factory}`)
  }

  const record = new ExtensionRecord(packageName, entryPath)
  const api = createExtensionAPI(record, globalEventBus)

  try {
    await factory(api)
  } catch (err) {
    throw new Error(`Extension "${packageName}" factory threw: ${err.message}`)
  }

  record.loaded = true
  record.factory = factory

  loadedExtensions.set(packageName, record)

  console.log(`[extensions] "${packageName}" loaded — ${record.tools.size} tool(s), ${record.commands.size} command(s), ${record.handlers.size} event type(s)`)

  return {
    loaded: true,
    packageName,
    tools: record.toolList.map(t => ({ name: t.name, description: t.description })),
    commands: [...record.commands.keys()],
  }
}

async function unloadExtension(packageName) {
  const record = loadedExtensions.get(packageName)
  if (!record) throw new Error(`Extension "${packageName}" is not loaded`)

  extensionTools = extensionTools.filter(t => t._extension !== packageName)
  record.toolList = []
  record.tools.clear()
  record.commands.clear()
  record.shortcuts.clear()
  record.flags.clear()
  record.messageRenderers.clear()
  record.entryRenderers.clear()
  record.handlers.clear()
  record.loaded = false

  loadedExtensions.delete(packageName)
  console.log(`[extensions] "${packageName}" unloaded`)
}

// ── Public API ────────────────────────────────────────────────

export async function installExtension(packageName) {
  const manifest = loadManifest()

  if (manifest.packages.includes(packageName)) {
    if (!loadedExtensions.has(packageName)) {
      return await loadInstalledExtension(packageName)
    }
    return { loaded: true, packageName, tools: [...loadedExtensions.get(packageName).toolList.map(t => ({ name: t.name, description: t.description }))] }
  }

  ensurePackagesDir()

  console.log(`[extensions] installing "${packageName}"…`)

  try {
    execSync(`npm install "${packageName}" --save`, {
      cwd: EXTENSIONS_DIR,
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: 'production' },
    })
  } catch (err) {
    const msg = err.stderr?.toString() || err.message || String(err)
    throw new Error(`npm install failed for "${packageName}": ${msg}`)
  }

  manifest.packages.push(packageName)
  saveManifest(manifest)

  return await loadInstalledExtension(packageName)
}

async function loadInstalledExtension(packageName) {
  const manifest = loadManifest()
  if (!manifest.packages.includes(packageName)) {
    throw new Error(`Extension "${packageName}" is not in the manifest`)
  }

  if (loadedExtensions.has(packageName)) {
    return { loaded: true, packageName, tools: [...loadedExtensions.get(packageName).toolList.map(t => ({ name: t.name, description: t.description }))] }
  }

  const { pkgDir, entryPath, pkgJson, isTs } = resolvePackageEntry(packageName)
  return await loadExtension(packageName, entryPath, pkgJson, isTs)
}

export async function removeExtension(packageName) {
  const manifest = loadManifest()

  if (!manifest.packages.includes(packageName)) {
    throw new Error(`Extension "${packageName}" is not installed`)
  }

  if (loadedExtensions.has(packageName)) {
    await unloadExtension(packageName)
  }

  manifest.packages = manifest.packages.filter(p => p !== packageName)
  saveManifest(manifest)

  try {
    execSync(`npm uninstall "${packageName}"`, {
      cwd: EXTENSIONS_DIR,
      stdio: 'pipe',
      timeout: 60_000,
    })
  } catch (err) {
    console.warn(`[extensions] npm uninstall warning for "${packageName}":`, err.message)
  }

  console.log(`[extensions] "${packageName}" removed`)
  return { removed: true, packageName }
}

export function getExtensionTools() {
  return extensionTools
}

export function listExtensions() {
  const manifest = loadManifest()
  return manifest.packages.map(name => {
    const record = loadedExtensions.get(name)
    return {
      name,
      loaded: !!record?.loaded,
      tools: record
        ? record.toolList.map(t => ({ name: t.name, description: t.description }))
        : [],
      commands: record
        ? [...record.commands.keys()]
        : [],
    }
  })
}

export async function reloadExtension(packageName) {
  if (loadedExtensions.has(packageName)) {
    await unloadExtension(packageName)
  }
  return await loadInstalledExtension(packageName)
}

export async function init() {
  ensurePackagesDir()
  const manifest = loadManifest()
  console.log(`[extensions] manifest has ${manifest.packages.length} package(s): ${manifest.packages.join(', ') || '(none)'}`)

  globalEventBus.emit('extensions:beforeInit', { manifest })

  for (const name of manifest.packages) {
    try {
      await loadInstalledExtension(name)
    } catch (err) {
      console.warn(`[extensions] failed to load "${name}": ${err.message}`)
    }
  }

  globalEventBus.emit('extensions:afterInit', { count: loadedExtensions.size, toolCount: extensionTools.length })
  console.log(`[extensions] init complete — ${extensionTools.length} extension tool(s) total`)
}

export async function reloadAll() {
  for (const [name] of loadedExtensions) {
    await unloadExtension(name)
  }
  await init()
}

export function dispose() {
  fireEvent('dispose', {})
  extensionTools = []
  loadedExtensions.clear()
  globalEventBus.removeAllListeners()
}
