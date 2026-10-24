import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionManager, buildSessionContext } from '@earendil-works/pi-coding-agent'

// Sessions persist through pi-coding-agent 1.4's SessionManager — one JSONL
// file per session under `<dataDir>/.s-loop/sessions`, compaction-aware via
// buildSessionContext. The pre-1.4 v4 repo format (files whose first line is
// `{v:4,kind:"header"}`) is not readable by SessionManager and is skipped by
// list(); those sessions were header-only in practice.
const SESSIONS_DIR = ['.s-loop', 'sessions']

function sessionsRoot(dataDir) {
  return join(dataDir, ...SESSIONS_DIR)
}

/** Parse the `{type:"session", id, ...}` header line of a 1.4 session file. */
async function readSessionHeader(file) {
  try {
    const text = await readFile(file, 'utf8')
    const newline = text.indexOf('\n')
    const firstLine = newline === -1 ? text : text.slice(0, newline)
    const header = JSON.parse(firstLine)
    if (header?.type !== 'session' || typeof header.id !== 'string') return null
    return { ...header, path: file }
  } catch {
    return null
  }
}

async function findSessionFile(dataDir, sessionId) {
  const root = sessionsRoot(dataDir)
  let files
  try {
    files = await readdir(root)
  } catch {
    return null
  }
  for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
    const full = join(root, file)
    const header = await readSessionHeader(full)
    if (header?.id === sessionId) return full
  }
  return null
}

function openManager(metadata, dataDir) {
  const manager = SessionManager.create(metadata.cwd || dataDir, sessionsRoot(dataDir))
  manager.setSessionFile(metadata.path)
  return manager
}

function wrapSession(manager, metadata, onClosed) {
  return {
    get metadata() {
      return metadata
    },
    async getMetadata() {
      return metadata
    },
    async appendMessage(message) {
      manager.appendMessage(message)
    },
    buildContext() {
      const context = buildSessionContext(manager.getEntries(), manager.getLeafId())
      return { messages: context.messages }
    },
    async close() {
      // SessionManager writes synchronously on append; nothing to flush.
      onClosed?.()
    },
  }
}

export function createSessionRepo(dataDir) {
  const open = new Map()
  return {
    async create(options) {
      const manager = SessionManager.create(
        options?.cwd || dataDir,
        sessionsRoot(dataDir),
        options?.id ? { id: options.id } : undefined,
      )
      const metadata = { id: manager.getSessionId(), cwd: options?.cwd || dataDir }
      const handle = wrapSession(manager, metadata, () => open.delete(metadata.id))
      open.set(metadata.id, handle)
      return handle
    },
    async open(metadata) {
      const existing = open.get(metadata.id)
      if (existing) return existing
      const file = metadata.path || (await findSessionFile(dataDir, metadata.id))
      if (!file) throw new Error(`Session file not found: ${metadata.id}`)
      const handle = wrapSession(openManager({ ...metadata, path: file }, dataDir), {
        ...metadata,
        path: file,
      }, () => open.delete(metadata.id))
      open.set(metadata.id, handle)
      return handle
    },
    async list() {
      const root = sessionsRoot(dataDir)
      let files
      try {
        files = await readdir(root)
      } catch {
        return []
      }
      const metadata = []
      for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
        const header = await readSessionHeader(join(root, file))
        if (header) metadata.push(header)
      }
      return metadata
    },
    async delete(metadata) {
      const handle = open.get(metadata.id)
      if (handle) {
        open.delete(metadata.id)
        await handle.close().catch(() => {})
      }
      const file = metadata.path || (await findSessionFile(dataDir, metadata.id))
      if (file) await rm(file, { force: true })
    },
  }
}

export async function findSession(repo, sessionId) {
  const list = await repo.list()
  return list.find((metadata) => metadata.id === sessionId)
}
