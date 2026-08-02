import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SNAPSHOT_VERSION = 1

function snapshotPath(dataDir, sessionId) {
  const key = createHash('sha256').update(String(sessionId)).digest('hex')
  return join(dataDir, '.s-loop', 'context-snapshots', `${key}.json`)
}

export function createContextSnapshot({
  sourceMessageCount,
  messages,
  compressionCount,
  tokensBefore,
  tokensAfter,
}) {
  return {
    version: SNAPSHOT_VERSION,
    sourceMessageCount,
    messages,
    compressionCount,
    tokensBefore,
    tokensAfter,
    createdAt: Date.now(),
  }
}

export function restoreContextFromSnapshot(fullMessages, snapshot) {
  if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) return fullMessages
  if (!Array.isArray(snapshot.messages)) return fullMessages
  if (!Number.isInteger(snapshot.sourceMessageCount)) return fullMessages
  if (snapshot.sourceMessageCount < 0 || snapshot.sourceMessageCount > fullMessages.length) {
    return fullMessages
  }
  return [
    ...snapshot.messages,
    ...fullMessages.slice(snapshot.sourceMessageCount),
  ]
}

export async function loadContextSnapshot(dataDir, sessionId) {
  try {
    const raw = await readFile(snapshotPath(dataDir, sessionId), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function saveContextSnapshot(dataDir, sessionId, snapshot) {
  const file = snapshotPath(dataDir, sessionId)
  const dir = join(dataDir, '.s-loop', 'context-snapshots')
  await mkdir(dir, { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(snapshot), 'utf8')
  await rm(file, { force: true })
  await rename(temporary, file)
}

export async function deleteContextSnapshot(dataDir, sessionId) {
  await rm(snapshotPath(dataDir, sessionId), { force: true })
}
