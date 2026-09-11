import {
  access,
  appendFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
  mkdtemp,
  lstat,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  JsonlSessionRepo,
  ok,
  err,
  FileError,
  BACKGROUND_CONTEXT,
  branchTip,
  createCompactionSummaryMessage,
  createBranchSummaryMessage,
} from '@earendil-works/pi-agent-core'

// pi-agent-core >= 0.84 exposes a low-level v4 session storage (branches,
// values, context-threaded FileSystem). S-Loop needs only three high-level
// operations — append a message, rebuild `{messages}` for resume, and
// session CRUD — so createSessionRepo returns a thin adapter over the v4
// primitives that keeps the pre-0.84 surface intact. All storage calls run
// on the ambient background context; aborts are not threaded into persistence.
const SESSION_BRANCH = 'main'
const CTX = BACKGROUND_CONTEXT

function nodeCodeToFileErrorCode(code) {
  switch (code) {
    case 'ENOENT': return 'not_found'
    case 'EACCES':
    case 'EPERM': return 'permission_denied'
    case 'ENOTDIR': return 'not_directory'
    case 'EISDIR': return 'is_directory'
    case 'EINVAL': return 'invalid'
    case 'ABORT_ERR': return 'aborted'
    default: return 'unknown'
  }
}

function toFileError(error, path) {
  if (error instanceof FileError) return error
  if (error instanceof Error && 'code' in error) {
    return new FileError(nodeCodeToFileErrorCode(error.code), error.message, path, error)
  }
  return new FileError('unknown', error?.message || String(error), path)
}

/** Node.js-backed {@link FileSystem} for the AgentHarness JSONL session repo. */
export class NodeFileSystem {
  constructor(cwd) {
    this.cwd = cwd
  }

  async absolutePath(path, _context) {
    try {
      return ok(isAbsolute(path) ? path : resolve(this.cwd, path))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async joinPath(parts, _context) {
    try {
      return ok(join(...parts))
    } catch (error) {
      return err(toFileError(error, parts.join('/')))
    }
  }

  async readTextFile(path, _context) {
    try {
      return ok(await readFile(path, 'utf8'))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async readTextLines(path, options = {}, _context) {
    try {
      const text = await readFile(path, 'utf8')
      const lines = text.split('\n')
      if (typeof options.maxLines === 'number') {
        return ok(lines.slice(0, options.maxLines))
      }
      return ok(lines)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async readBinaryFile(path, _context) {
    try {
      return ok(await readFile(path))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async writeFile(path, content, _context) {
    try {
      await writeFile(path, content)
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async appendFile(path, content, _context) {
    try {
      await appendFile(path, content)
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async renameFile(sourcePath, destinationPath, _context) {
    try {
      await rename(sourcePath, destinationPath)
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, sourcePath))
    }
  }

  async fileInfo(path, _context) {
    try {
      const stats = await lstat(path)
      const kind = stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : undefined
      if (!kind) return err(new FileError('invalid', 'Unsupported file type', path))
      return ok({
        name: basename(path),
        path,
        kind,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      })
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async listDir(path, _context) {
    try {
      const entries = await readdir(path, { withFileTypes: true })
      const infos = []
      for (const entry of entries) {
        const entryPath = join(path, entry.name)
        const kind = entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : undefined
        if (!kind) continue
        const stats = await lstat(entryPath).catch(() => null)
        infos.push({
          name: entry.name,
          path: entryPath,
          kind,
          size: stats?.size ?? 0,
          mtimeMs: stats?.mtimeMs ?? 0,
        })
      }
      return ok(infos)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async canonicalPath(path, _context) {
    try {
      return ok(await realpath(path))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async exists(path, _context) {
    try {
      await access(path)
      return ok(true)
    } catch {
      return ok(false)
    }
  }

  async createDir(path, options = {}, _context) {
    try {
      await mkdir(path, { recursive: options.recursive ?? true })
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async remove(path, options = {}, _context) {
    try {
      await rm(path, { recursive: options.recursive ?? false, force: options.force ?? false })
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async createTempDir(prefix = 'tmp-', _context) {
    try {
      const dir = await mkdtemp(join(tmpdir(), prefix))
      return ok(dir)
    } catch (error) {
      return err(toFileError(error, tmpdir()))
    }
  }

  async createTempFile(options = {}, _context) {
    const prefix = options.prefix ?? ''
    const suffix = options.suffix ?? ''
    const path = join(tmpdir(), `${prefix}${randomUUID()}${suffix}`)
    try {
      await writeFile(path, '')
      return ok(path)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async cleanup(_context) {
    // No persistent resources to release.
  }
}

/** Rebuild `{messages}` for session resume from the persisted branch. */
async function buildSessionContext(raw) {
  const storedTip = await raw.getValue(branchTip(SESSION_BRANCH), CTX)
  const tipId = storedTip?.value
  if (!tipId) return { messages: [] }
  const entries = await raw.scanBranch({ start: tipId, order: 'oldestFirst' }, CTX)
  const messages = []
  for (const entry of entries) {
    if (entry.type === 'message') {
      messages.push(entry.message)
    } else if (entry.type === 'compaction') {
      // A compaction replaces earlier history with its summary; the retained
      // tail stays verbatim so recent turns survive compaction intact.
      messages.push(createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp))
      if (Array.isArray(entry.retainedTail)) messages.push(...entry.retainedTail)
    } else if (entry.type === 'branch_summary') {
      messages.push(createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp))
    }
  }
  return { messages }
}

/** Present the v4 storage-backed session through the pre-0.84 surface. */
function wrapSession(raw, onClosed) {
  let mainBranch = null
  async function ensureBranch() {
    if (!mainBranch) {
      mainBranch = (await raw.branch(SESSION_BRANCH, CTX))
        ?? await raw.createBranch(SESSION_BRANCH, null, CTX)
    }
    return mainBranch
  }
  return {
    get metadata() { return raw.metadata },
    async getMetadata() {
      return raw.metadata
    },
    async appendMessage(message) {
      const branch = await ensureBranch()
      await branch.appendMessage(message, CTX)
    },
    buildContext() {
      return buildSessionContext(raw)
    },
    async close() {
      try { await raw.close(CTX) } finally { onClosed?.() }
    },
  }
}

export function createSessionRepo(dataDir) {
  const fileSystem = new NodeFileSystem(dataDir)
  const repo = new JsonlSessionRepo({ fileSystem, sessionsRoot: '.s-loop/sessions' })
  // The v4 repo refuses duplicate opens and deleting open sessions, so track
  // raw handles here: reopen returns the live handle, and delete closes first.
  const openRaw = new Map()
  return {
    async create(options) {
      const raw = await repo.create(options, CTX)
      openRaw.set(raw.metadata.id, raw)
      return wrapSession(raw, () => openRaw.delete(raw.metadata.id))
    },
    async open(metadata) {
      let raw = openRaw.get(metadata.id)
      if (!raw) {
        raw = await repo.open(metadata, CTX)
        openRaw.set(metadata.id, raw)
      }
      return wrapSession(raw, () => openRaw.delete(metadata.id))
    },
    async list() {
      return repo.list(undefined, CTX)
    },
    async delete(metadata) {
      const raw = openRaw.get(metadata.id)
      if (raw) {
        openRaw.delete(metadata.id)
        await raw.close(CTX).catch(() => {})
      }
      await repo.delete(metadata, CTX)
    },
  }
}

export async function findSession(repo, sessionId) {
  const list = await repo.list()
  return list.find((metadata) => metadata.id === sessionId)
}
