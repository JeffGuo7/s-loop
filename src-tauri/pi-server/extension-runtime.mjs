/**
 * extension-runtime.mjs — Pi Extension Runtime for s-loop
 *
 * Loads pi.dev packages (extensions) into the pi-server so that their
 * registered tools become available to the AI agent.
 *
 * Each extension is an npm package whose default export is an
 * ExtensionFactory: (pi: ExtensionAPI) => void | Promise<void>
 *
 * The runtime provides a custom ExtensionAPI implementation that:
 *  - Collects tools registered via pi.registerTool()
 *  - Stubs out Pi CLI–specific features not applicable to s-loop
 *  - Supports lifecycle: install → load → unload → remove
 */

import { randomUUID } from 'node:crypto'
import { execSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ── Config ────────────────────────────────────────────────────

const EXTENSIONS_DIR = path.resolve(
  process.env.S_LOOP_PROJECT_DIR || process.env.SNOTRA_PROJECT_DIR || process.cwd(),
  'pi-server', 'extensions',
)

const MANIFEST_PATH = path.join(
  path.dirname(EXTENSIONS_DIR), 'extensions-manifest.json',
)

// ── Internal state ────────────────────────────────────────────

/** Map<packageName, { loaded, tools[], factory, def }> */
const loadedExtensions = new Map()

/** Tools registered by all currently loaded extensions */
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
  // Ensure the packages dir has a package.json so npm install works
  const pkgPath = path.join(EXTENSIONS_DIR, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify({
      name: 's-loop-extensions',
      private: true,
      type: 'module',
    }, null, 2), 'utf-8')
  }
}

/**
 * Resolve the main entry point of an npm package installed in EXTENSIONS_DIR.
 * Follows Node.js resolution: package.json → main/exports → index.js
 */
function resolvePackageEntry(packageName) {
  const pkgDir = path.join(EXTENSIONS_DIR, 'node_modules', packageName)

  // Resolve via package.json main/exports
  const pkgJsonPath = path.join(pkgDir, 'package.json')
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      // Try exports first (modern), then main (legacy)
      const entry = pkgJson.exports?.['.']?.import
        || pkgJson.exports?.['.']?.default
        || pkgJson.exports?.['.']
        || pkgJson.main
        || 'index.js'
      const resolved = path.resolve(pkgDir, typeof entry === 'string' ? entry : 'index.js')
      if (fs.existsSync(resolved)) return { pkgDir, entryPath: resolved, pkgJson }
    } catch {}
  }

  // Fallback: index.js
  const fallback = path.join(pkgDir, 'index.js')
  if (fs.existsSync(fallback)) return { pkgDir, entryPath: fallback, pkgJson: null }

  throw new Error(`Cannot resolve entry point for package "${packageName}". Looked in ${pkgDir}`)
}

// ── ExtensionAPI implementation ───────────────────────────────

/**
 * Create a custom ExtensionAPI for a single extension load call.
 * Collects tools into the `tools` array.
 */
function createExtensionAPI({ onToolRegistered, onCommand, onError }) {
  return {
    // ── Event hooks ──
    on(event, handler) {
      // For s-loop, we don't run extension event hooks because
      // we use our own lifecycle. Extensions that only register tools
      // via on() handlers won't work — recommend the user to use
      // registerTool() in their factory function instead.
      console.log(`[extensions] stub: on("${event}") — not supported in s-loop (use registerTool() directly)`)
    },

    // ── Tool registration (this is what we care about) ──
    registerTool(toolDef) {
      console.log(`[extensions] registered tool: "${toolDef.name || '(unnamed)'}"`)
      if (onToolRegistered) onToolRegistered(toolDef)
    },

    // ── Commands ──
    registerCommand(name, options) {
      if (onCommand) onCommand(name, options)
      console.log(`[extensions] stub: registerCommand("${name}") — not supported in s-loop`)
    },

    // ── Shortcuts (stub) ──
    registerShortcut(key, options) {
      console.log(`[extensions] stub: registerShortcut("${key}") — not supported in s-loop`)
    },

    // ── Flags (stub) ──
    registerFlag(name, options) {
      console.log(`[extensions] stub: registerFlag("${name}") — not supported in s-loop`)
    },
    getFlag(name) { return undefined },

    // ── Session & state (stubs for s-loop) ──
    sendMessage(msg, opts) {
      console.log(`[extensions] stub: sendMessage — not supported in s-loop`)
    },
    sendUserMessage(content, opts) {
      console.log(`[extensions] stub: sendUserMessage — not supported in s-loop`)
    },
    appendEntry(type, data) {
      console.log(`[extensions] stub: appendEntry("${type}") — not supported in s-loop`)
    },
    registerMessageRenderer(type, renderer) {
      console.log(`[extensions] stub: registerMessageRenderer("${type}") — not supported in s-loop`)
    },

    // ── Session name ──
    setSessionName(name) {},
    getSessionName() { return undefined },

    // ── Labels ──
    setLabel(entryId, label) {},

    // ── Shell exec (stub — not sandboxed in s-loop context) ──
    async exec(command, args, options) {
      console.log(`[extensions] stub: exec("${command}") — not available in s-loop`)
      return { exitCode: 1, stdout: '', stderr: 'exec not available in s-loop' }
    },

    // ── Tool queries (stubs) ──
    getActiveTools() { return [] },
    getAllTools() { return [] },
    setActiveTools(names) {},
    getCommands() { return [] },
    setActiveCommands(names) {},

    // ── Model queries (stubs) ──
    getModel() { return null },
    getModels() { return [] },
    setModel(id) {},

    // ── Thinking level ──
    getThinkingLevel() { return 'off' },
    setThinkingLevel(level) {},

    // ── Provider registration (stub) ──
    registerProvider(name, config) {},
    unregisterProvider(name) {},

    // ── UI (stub — no terminal UI in s-loop) ──
    ui: {
      select: async (opts) => { throw new Error('ui.select not available in s-loop') },
      confirm: async (msg) => { throw new Error('ui.confirm not available in s-loop') },
      input: async (opts) => { throw new Error('ui.input not available in s-loop') },
      notify: (msg) => { console.log(`[extensions:ui] ${msg}`) },
    },

    // ── Warning callback ──
    onerror: onError,
  }
}

// ── Core load / unload ────────────────────────────────────────

async function loadExtension(packageName, entryPath, pkgJson) {
  console.log(`[extensions] loading "${packageName}" from ${entryPath}`)

  // Use dynamic import with cache-busting query param for ESM modules.
  // This ensures hot-reload works even though ESM caches modules.
  const resolvedPath = path.resolve(entryPath)

  let mod
  try {
    // Use dynamic import for ESM modules
    mod = await import(resolvedPath + '?t=' + Date.now())
  } catch (err) {
    throw new Error(`Failed to import extension "${packageName}": ${err.message}`)
  }

  // The default export should be an ExtensionFactory function
  const factory = mod.default || mod
  if (typeof factory !== 'function') {
    throw new Error(`Extension "${packageName}" does not export a default factory function. Got: ${typeof factory}`)
  }

  const tools = []

  const api = createExtensionAPI({
    onToolRegistered: (toolDef) => {
      tools.push({
        ...toolDef,
        _extension: packageName,
      })
    },
    onCommand: (name, options) => {
      console.log(`[extensions] "${packageName}" registered command "${name}" (stubbed)`)
    },
    onError: (err) => {
      console.error(`[extensions] "${packageName}" error:`, err)
    },
  })

  try {
    await factory(api)
  } catch (err) {
    throw new Error(`Extension "${packageName}" factory threw: ${err.message}`)
  }

  console.log(`[extensions] "${packageName}" loaded — ${tools.length} tool(s) registered`)

  return { tools, factory }
}

async function unloadExtension(packageName) {
  const entry = loadedExtensions.get(packageName)
  if (!entry) throw new Error(`Extension "${packageName}" is not loaded`)

  // Remove its tools from the global list
  extensionTools = extensionTools.filter(t => t._extension !== packageName)
  loadedExtensions.delete(packageName)
  console.log(`[extensions] "${packageName}" unloaded`)
}

// ── Public API ────────────────────────────────────────────────

/**
 * Install a pi.dev package by name.
 * Runs `npm install <packageName>` in the extensions packages directory,
 * then loads the extension.
 */
export async function installExtension(packageName) {
  const manifest = loadManifest()

  // Check if already installed
  if (manifest.packages.includes(packageName)) {
    // Try to load it if not yet loaded
    if (!loadedExtensions.has(packageName)) {
      return await loadInstalledExtension(packageName)
    }
    return { loaded: true, packageName, tools: loadedExtensions.get(packageName)?.tools || [] }
  }

  ensurePackagesDir()

  console.log(`[extensions] installing "${packageName}"…`)

  // Run npm install
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

  // Add to manifest
  manifest.packages.push(packageName)
  saveManifest(manifest)

  // Load it
  return await loadInstalledExtension(packageName)
}

/**
 * Load an already-installed extension by name.
 */
async function loadInstalledExtension(packageName) {
  // Validate it's known to the manifest
  const manifest = loadManifest()
  if (!manifest.packages.includes(packageName)) {
    throw new Error(`Extension "${packageName}" is not in the manifest`)
  }

  // If already loaded, return current state
  if (loadedExtensions.has(packageName)) {
    return { loaded: true, packageName, tools: loadedExtensions.get(packageName).tools }
  }

  const { pkgDir, entryPath, pkgJson } = resolvePackageEntry(packageName)

  const result = await loadExtension(packageName, entryPath, pkgJson)

  loadedExtensions.set(packageName, result)
  // Add tools to global list
  extensionTools.push(...result.tools)

  return { loaded: true, packageName, tools: result.tools.map(t => ({ name: t.name, description: t.description })) }
}

/**
 * Unload and remove an installed extension.
 * Removes the npm package and updates the manifest.
 */
export async function removeExtension(packageName) {
  const manifest = loadManifest()

  if (!manifest.packages.includes(packageName)) {
    throw new Error(`Extension "${packageName}" is not installed`)
  }

  // Unload if loaded
  if (loadedExtensions.has(packageName)) {
    await unloadExtension(packageName)
  }

  // Remove from manifest
  manifest.packages = manifest.packages.filter(p => p !== packageName)
  saveManifest(manifest)

  // npm uninstall
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

/**
 * Get all loaded extension tools, ready to merge into the tool list.
 * Each tool has an `_extension` property indicating which package it came from.
 */
export function getExtensionTools() {
  return extensionTools
}

/**
 * Get status of installed extensions.
 */
export function listExtensions() {
  const manifest = loadManifest()
  return manifest.packages.map(name => ({
    name,
    loaded: loadedExtensions.has(name),
    tools: loadedExtensions.has(name)
      ? loadedExtensions.get(name).tools.map(t => ({ name: t.name, description: t.description }))
      : [],
  }))
}

/**
 * Reload a specific extension.
 */
export async function reloadExtension(packageName) {
  if (loadedExtensions.has(packageName)) {
    await unloadExtension(packageName)
  }
  return await loadInstalledExtension(packageName)
}

/**
 * Initialize: load all extensions from the manifest.
 */
export async function init() {
  ensurePackagesDir()
  const manifest = loadManifest()
  console.log(`[extensions] manifest has ${manifest.packages.length} package(s): ${manifest.packages.join(', ') || '(none)'}`)

  for (const name of manifest.packages) {
    try {
      await loadInstalledExtension(name)
    } catch (err) {
      console.warn(`[extensions] failed to load "${name}": ${err.message}`)
    }
  }

  console.log(`[extensions] init complete — ${extensionTools.length} extension tool(s) total`)
}

/**
 * Reload all extensions.
 */
export async function reloadAll() {
  // Unload all
  for (const [name] of loadedExtensions) {
    await unloadExtension(name)
  }
  // Reload from manifest
  await init()
}

// ── Cleanup ───────────────────────────────────────────────────

export function dispose() {
  extensionTools = []
  loadedExtensions.clear()
}
