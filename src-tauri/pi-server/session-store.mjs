import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { SessionManager, buildSessionContext } from '@earendil-works/pi-coding-agent'

// Sessions persist through pi-coding-agent 1.4's SessionManager — one JSONL
// file per session under `<dataDir>/.s-loop/sessions`, compaction-aware via
// buildSessionContext. Sessions written by the pre-1.4 v4 storage (first line
// `{v:4,kind:"header"}`, entries under per-cwd subdirectories) are migrated
// once into 1.4 files at the sessions root; the originals are left untouched.
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

/**
 * Convert one v4 session file to the 1.4 format.
 *
 * v4 layout: a `{v:4,kind:"header"}` line, `pi.branch.tip` value rows, and
 * message/compaction entries wrapped as `[entry, version]` array lines. The
 * 1.4 file gets a `{type:"session"}` header plus a linear entry chain (chat
 * sessions were single-branch, so append order is the conversation order).
 * Compaction and branch-summary entries become synthetic user messages —
 * their summary content survives for resume without relying on the v4
 * entry-graph invariants 1.4 cannot reconstruct.
 */
async function convertV4Session(file) {
  const text = await readFile(file, 'utf8')
  const lines = text.split('\n').filter(Boolean)
  if (lines.length === 0) return null
  let header
  try {
    header = JSON.parse(lines[0])
  } catch {
    return null
  }
  if (header?.kind !== 'header' || typeof header.id !== 'string') return null

  const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString())
  const outEntries = []
  let previousId = null
  for (const line of lines.slice(1)) {
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue // value/version rows carry no messages
    const entry = parsed[0]
    if (!entry || typeof entry !== 'object') continue
    const id = typeof entry.id === 'string' && entry.id ? entry.id : `migrated-${outEntries.length}`
    if (entry.type === 'message' && entry.message) {
      const ts = iso(entry.message?.timestamp ?? entry.timestamp)
      const message = { ...entry.message }
      delete message.timestamp
      outEntries.push({ type: 'message', id, parentId: previousId, timestamp: ts, message })
      previousId = id
    } else if (entry.type === 'compaction' && typeof entry.summary === 'string') {
      const id2 = `${id}-summary`
      outEntries.push({
        type: 'message',
        id: id2,
        parentId: previousId,
        timestamp: iso(entry.timestamp),
        message: {
          role: 'user',
          content: [{ type: 'text', text: `[Earlier conversation was compacted]\n\n${entry.summary}` }],
        },
      })
      previousId = id2
      const tail = Array.isArray(entry.retainedTail) ? entry.retainedTail : []
      for (const tailMessage of tail) {
        const tailId = `${id}-tail-${outEntries.length}`
        const tailTs = iso(tailMessage?.timestamp)
        const message = { ...tailMessage }
        delete message.timestamp
        outEntries.push({ type: 'message', id: tailId, parentId: previousId, timestamp: tailTs, message })
        previousId = tailId
      }
    } else if (entry.type === 'branch_summary' && typeof entry.summary === 'string') {
      const id2 = `${id}-summary`
      outEntries.push({
        type: 'message',
        id: id2,
        parentId: previousId,
        timestamp: iso(entry.timestamp),
        message: {
          role: 'user',
          content: [{ type: 'text', text: `[Branch summary]\n\n${entry.summary}` }],
        },
      })
      previousId = id2
    }
  }

  const converted = {
    type: 'session',
    id: header.id,
    ...(typeof header.cwd === 'string' ? { cwd: header.cwd } : {}),
    ...(Number.isFinite(header.createdAt) ? { createdAt: iso(header.createdAt) } : {}),
  }
  if (outEntries.length === 0) return null // header-only sessions carry nothing to resume
  return { header: converted, entries: outEntries }
}

/** One-time, idempotent v4 -> 1.4 migration for `<root>`/**\/*.jsonl. */
async function migrateLegacyV4Sessions(root) {
  let dirents
  try {
    dirents = await readdir(root, { withFileTypes: true, recursive: true })
  } catch {
    return
  }
  const jsonlFiles = dirents
    .filter((d) => d.isFile() && d.name.endsWith('.jsonl'))
    .map((d) => join(d.parentPath ?? d.path, d.name))
  if (jsonlFiles.length === 0) return

  // Idempotency: skip ids that already have a 1.4 file at the root.
  const existing = new Set()
  const rootFiles = dirents
    .filter((d) => d.isFile() && d.name.endsWith('.jsonl') && (d.parentPath ?? d.path) === root)
    .map((d) => d.name)
  for (const name of rootFiles) {
    const header = await readSessionHeader(join(root, name))
    if (header?.id) existing.add(header.id)
  }

  for (const file of jsonlFiles) {
    if ((file === join(root, basename(file)))) continue // already at root
    let converted
    try {
      converted = await convertV4Session(file)
    } catch {
      continue
    }
    if (!converted) continue
    if (existing.has(converted.header.id)) continue
    await mkdir(root, { recursive: true })
    const lines = [JSON.stringify(converted.header), ...converted.entries.map((e) => JSON.stringify(e))]
    await writeFile(join(root, basename(file)), lines.join('\n') + '\n')
    existing.add(converted.header.id)
    console.log(`[session-store] migrated legacy session ${converted.header.id} <- ${file}`)
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
  // v4 -> 1.4 migration runs once per process; listing (and everything that
  // reads through it) waits for it so migrated sessions appear immediately.
  const migration = migrateLegacyV4Sessions(sessionsRoot(dataDir)).catch((error) => {
    console.warn('[session-store] legacy session migration failed:', error?.message || error)
  })
  return {
    async create(options) {
      await migration
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
      await migration
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
      await migration
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
