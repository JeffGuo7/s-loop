import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Environment variables required for shells, language runtimes, proxies and
// enterprise certificate stores. Credentials and code-injection variables
// such as *_API_KEY, *_TOKEN, NODE_OPTIONS and NODE_PATH are intentionally
// excluded.
const SAFE_CHILD_ENV_KEYS = new Set([
  'path', 'pathext', 'comspec', 'systemroot', 'windir',
  'programfiles', 'programfiles(x86)', 'programw6432', 'programdata',
  'userprofile', 'homedrive', 'homepath', 'home', 'user', 'username', 'shell',
  'appdata', 'localappdata', 'temp', 'tmp', 'tmpdir',
  'lang', 'language', 'lc_all', 'lc_ctype', 'term', 'colorterm',
  'no_color', 'force_color',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'ssl_cert_file', 'ssl_cert_dir', 'node_extra_ca_certs',
  'pythonutf8', 'pythonioencoding', 'npm_config_registry',
])

export function sanitizeChildEnvironment(env = process.env, workspaceDir) {
  const safe = {}
  for (const [key, value] of Object.entries(env || {})) {
    if (value !== undefined && SAFE_CHILD_ENV_KEYS.has(key.toLowerCase())) {
      safe[key] = value
    }
  }
  safe.LANG = safe.LANG || 'en_US.UTF-8'
  safe.LC_ALL = safe.LC_ALL || 'en_US.UTF-8'
  safe.PYTHONUTF8 = '1'
  safe.PYTHONIOENCODING = 'utf-8'
  safe.S_LOOP_SANDBOX = 'workspace'
  if (workspaceDir) safe.S_LOOP_ALLOWED_ROOT = path.resolve(workspaceDir)
  return safe
}

function expandHome(value) {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

function canonicalizeWithExistingAncestor(targetPath) {
  let current = targetPath
  const missing = []

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    missing.unshift(path.basename(current))
    current = parent
  }

  let canonical = current
  if (fs.existsSync(current)) {
    try {
      canonical = fs.realpathSync.native(current)
    } catch {
      canonical = fs.realpathSync(current)
    }
  }
  return path.resolve(canonical, ...missing)
}

function comparable(value) {
  const normalized = path.normalize(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isWithin(candidate, root) {
  const child = comparable(candidate)
  const parent = comparable(root)
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep)
}

export function resolveSandboxPath(filePath, workspaceDir) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null
  const base = workspaceDir ? path.resolve(workspaceDir) : process.cwd()
  return canonicalizeWithExistingAncestor(path.resolve(base, expandHome(filePath.trim())))
}

export function getSandboxRoots(workspaceDir, workspaceRoots = []) {
  const rawRoots = []
  if (typeof workspaceDir === 'string' && workspaceDir.trim()) {
    rawRoots.push({
      path: workspaceDir,
      access: 'read-write',
      primary: true,
      source: 'workspace',
    })
  }
  for (const value of Array.isArray(workspaceRoots) ? workspaceRoots : []) {
    if (typeof value === 'string' && value.trim()) {
      // Legacy accessiblePaths entries implicitly allowed reads and writes.
      rawRoots.push({ path: value, access: 'read-write', primary: false, source: 'user-grant' })
    } else if (value && typeof value === 'object' && typeof value.path === 'string' && value.path.trim()) {
      rawRoots.push({
        path: value.path,
        access: value.access === 'read-write' ? 'read-write' : 'read',
        primary: value.primary === true,
        source: value.source || 'user-grant',
      })
    }
  }

  const rootsByPath = new Map()
  for (const rawRoot of rawRoots) {
    const resolvedPath = resolveSandboxPath(rawRoot.path, workspaceDir)
    if (!resolvedPath) continue
    const key = comparable(resolvedPath)
    const existing = rootsByPath.get(key)
    if (existing) {
      if (rawRoot.access === 'read-write') existing.access = 'read-write'
      if (rawRoot.primary) existing.primary = true
      continue
    }
    rootsByPath.set(key, { ...rawRoot, path: resolvedPath })
  }
  return [...rootsByPath.values()]
}

export function checkWorkspacePath(filePath, workspaceDir, workspaceRoots = [], requiredAccess = 'read') {
  const candidate = resolveSandboxPath(filePath, workspaceDir)
  if (!candidate) return { allowed: false, reason: 'A valid file path is required' }

  const roots = getSandboxRoots(workspaceDir, workspaceRoots)
  if (roots.length === 0) {
    return { allowed: false, reason: 'No workspace is configured for file access' }
  }
  const matchingRoots = roots.filter((root) => isWithin(candidate, root.path))
  if (matchingRoots.length > 0) {
    if (requiredAccess !== 'read-write' || matchingRoots.some((root) => root.access === 'read-write')) {
      return { allowed: true, resolvedPath: candidate }
    }
    return {
      allowed: false,
      resolvedPath: candidate,
      reason: `Write blocked: path is granted as read-only: ${filePath}`,
    }
  }
  return {
    allowed: false,
    resolvedPath: candidate,
    reason: `Path is outside the workspace sandbox: ${filePath}`,
  }
}

const FILE_TOOL_PATH_KEYS = {
  read: ['path'],
  write: ['path'],
  edit: ['path'],
  grep: ['path'],
  find: ['path'],
  ls: ['path'],
  apply_diff: ['path', 'filePath', 'file_path'],
  replace_in_file: ['path', 'filePath', 'file_path'],
  delete: ['path', 'filePath', 'file_path'],
  remove: ['path', 'filePath', 'file_path'],
}

export function getToolPathArguments(toolName, args = {}) {
  const lowerName = String(toolName || '').toLowerCase()
  const keys = FILE_TOOL_PATH_KEYS[lowerName]
    || (/(?:read|write|edit|file|delete|remove|grep|find|glob|list|\bls\b)/.test(lowerName)
      ? ['path', 'filePath', 'file_path', 'directory', 'dir', 'cwd', 'source', 'destination', 'target']
      : null)
  if (!keys) return []
  const values = []
  for (const key of keys) {
    const value = args?.[key]
    if (typeof value === 'string' && value.trim()) values.push(value)
    if (Array.isArray(value)) {
      values.push(...value.filter((item) => typeof item === 'string' && item.trim()))
    }
  }
  // Optional path arguments on grep/find/ls mean the workspace root.
  if (values.length === 0 && ['grep', 'find', 'ls'].includes(lowerName)) {
    values.push('.')
  }
  return values
}

export function getDeclaredPathArguments(args = {}, pathArguments = [], defaultPath) {
  const values = []
  for (const key of Array.isArray(pathArguments) ? pathArguments : []) {
    const value = args?.[key]
    if (typeof value === 'string' && value.trim()) values.push(value)
    if (Array.isArray(value)) {
      values.push(...value.filter((item) => typeof item === 'string' && item.trim()))
    }
  }
  if (values.length === 0 && typeof defaultPath === 'string' && defaultPath.trim()) {
    values.push(defaultPath)
  }
  return values
}

export function checkToolWorkspace(toolName, args, workspaceDir, workspaceRoots = [], requiredAccess = 'read') {
  for (const filePath of getToolPathArguments(toolName, args)) {
    const result = checkWorkspacePath(filePath, workspaceDir, workspaceRoots, requiredAccess)
    if (!result.allowed) return result
  }
  return { allowed: true }
}
