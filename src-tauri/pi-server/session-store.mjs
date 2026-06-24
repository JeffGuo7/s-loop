import {
  access,
  appendFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
  mkdtemp,
  lstat,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonlSessionRepo, ok, err, FileError } from '@earendil-works/pi-agent-core'

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

  async absolutePath(path, _abortSignal) {
    try {
      return ok(isAbsolute(path) ? path : resolve(this.cwd, path))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async joinPath(parts, _abortSignal) {
    try {
      return ok(join(...parts))
    } catch (error) {
      return err(toFileError(error, parts.join('/')))
    }
  }

  async readTextFile(path, _abortSignal) {
    try {
      return ok(await readFile(path, 'utf8'))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async readTextLines(path, options = {}) {
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

  async readBinaryFile(path, _abortSignal) {
    try {
      return ok(await readFile(path))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async writeFile(path, content, _abortSignal) {
    try {
      await writeFile(path, content)
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async appendFile(path, content, _abortSignal) {
    try {
      await appendFile(path, content)
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async fileInfo(path, _abortSignal) {
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

  async listDir(path, _abortSignal) {
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

  async canonicalPath(path, _abortSignal) {
    try {
      return ok(await realpath(path))
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async exists(path, _abortSignal) {
    try {
      await access(path)
      return ok(true)
    } catch {
      return ok(false)
    }
  }

  async createDir(path, options = {}) {
    try {
      await mkdir(path, { recursive: options.recursive ?? true })
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async remove(path, options = {}) {
    try {
      await rm(path, { recursive: options.recursive ?? false, force: options.force ?? false })
      return ok(undefined)
    } catch (error) {
      return err(toFileError(error, path))
    }
  }

  async createTempDir(prefix = 'tmp-', _abortSignal) {
    try {
      const dir = await mkdtemp(join(tmpdir(), prefix))
      return ok(dir)
    } catch (error) {
      return err(toFileError(error, tmpdir()))
    }
  }

  async createTempFile(options = {}, _abortSignal) {
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

  async cleanup() {
    // No persistent resources to release.
  }
}

export function createSessionRepo(dataDir) {
  const fs = new NodeFileSystem(dataDir)
  return new JsonlSessionRepo({ fs, sessionsRoot: '.s-loop/sessions' })
}

export async function findSession(repo, sessionId) {
  const list = await repo.list()
  return list.find((metadata) => metadata.id === sessionId)
}
