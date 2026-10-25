/**
 * OS-level exec sandbox for the bash tool.
 *
 * On Windows every bash command runs through `sloop-runbox` (runbox crate),
 * which starts the shell inside a zero-capability AppContainer:
 *   - no network at all (no internetClient capability),
 *   - filesystem access only inside explicitly granted directories
 *     (workspace + extra writable roots + the OS temp dir + the bundled
 *     busybox runtime),
 * so even an approved command cannot touch the rest of the user profile.
 *
 * The sandboxed shell is the bundled busybox sh. Git for Windows' MSYS
 * binaries cannot run in an AppContainer at all (the MSYS runtime creates
 * named shared-memory objects in \BaseNamedObjects, which AppContainers may
 * not access), so `git` and other MSYS tools are unavailable inside the
 * sandbox. Commands that need them require turning the sandbox off for the
 * session (`execSandbox: false`).
 *
 * Off Windows, or when the helper/runtime is missing, this returns null and
 * the caller falls back to the policy-only exec path (documented trade-off).
 */

import { spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeChildEnvironment } from './sandbox.mjs'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))

/** Locate the runbox helper: env override, packaged sidecar bin, dev target. */
export function resolveRunboxPath() {
  if (process.platform !== 'win32') return null
  const candidates = [
    process.env.S_LOOP_RUNBOX,
    join(SERVER_DIR, 'bin', 'sloop-runbox.exe'),
    resolve(SERVER_DIR, '..', '..', 'runbox', 'target', 'release', 'sloop-runbox.exe'),
    resolve(SERVER_DIR, '..', '..', 'runbox', 'target', 'debug', 'sloop-runbox.exe'),
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

/** Locate the bundled POSIX shell (busybox-w32). */
export function resolveBusyboxPath() {
  if (process.platform !== 'win32') return null
  const candidates = [
    process.env.S_LOOP_BUSYBOX,
    join(SERVER_DIR, 'bin', 'busybox.exe'),
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

function pathExists(path) {
  try {
    accessSync(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function buildRunboxArgs({ writableRoots, readonlyRoots, shell, shellArgs = [], command, cwd }) {
  const args = []
  const seen = new Set()
  const addRoot = (flag, dir) => {
    if (typeof dir !== 'string' || !dir.trim()) return
    const key = `${flag}:${resolve(dir).toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    args.push(flag, dir)
  }
  // The first --rw also becomes the child's working directory.
  if (cwd) addRoot('--rw', cwd)
  for (const dir of writableRoots) addRoot('--rw', dir)
  for (const dir of readonlyRoots) addRoot('--rx', dir)
  args.push('--', shell, ...shellArgs, command)
  return args
}

function killTree(pid) {
  if (!pid) return
  try {
    const child = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/F', '/T', '/PID', String(pid)], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    })
    child.once('error', () => {})
  } catch {
    // best effort
  }
}

const runtimeCache = { promise: null }

/** Verify once that busybox can run inside the container from its directory. */
function prepareRuntime(runbox) {
  const busybox = resolveBusyboxPath()
  if (!busybox) return { shell: null, reason: 'bundled busybox runtime missing' }
  const busyboxDir = dirname(busybox)
  const probe = spawnSync(runbox, ['--rx', busyboxDir, '--', busybox, 'sh', '-c', 'exit 0'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  })
  if (probe.status !== 0) {
    return {
      shell: null,
      reason: `busybox probe failed (${probe.status}): ${String(probe.stderr || '').slice(0, 200)}`,
    }
  }
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  return {
    shell: busybox,
    shellArgs: ['sh', '-c'],
    runtimeRoot: busyboxDir,
    env: {
      PATH: `${busyboxDir};${join(systemRoot, 'System32')};${systemRoot}`,
    },
  }
}

function ensureRuntime(runbox) {
  if (!runtimeCache.promise) {
    runtimeCache.promise = Promise.resolve().then(() => prepareRuntime(runbox))
  }
  return runtimeCache.promise
}

/**
 * Create BashOperations that exec through runbox.
 *
 * Returns null when the platform/helper cannot sandbox at all.
 *
 * @param {{ workspaceDir: string, writableRoots?: string[], readonlyRoots?: string[] }} options
 */
export function createSandboxedBashOperations({ workspaceDir, writableRoots = [], readonlyRoots = [] }) {
  const runbox = resolveRunboxPath()
  if (!runbox) return null
  // Grant a private temp subdirectory, never the whole %TEMP%: an inheritable
  // ACE applied to the temp root propagates to every existing file there and
  // takes seconds.
  const tempRoot = process.env.TEMP || process.env.TMP || null
  const tempDir = tempRoot ? join(tempRoot, 'sloop-runbox-tmp') : null
  if (tempDir) {
    try { mkdirSync(tempDir, { recursive: true }) } catch { /* best effort */ }
  }

  const exec = (command, cwd, { onData, signal, timeout, env }) =>
    new Promise((resolvePromise, reject) => {
      if (signal?.aborted) {
        reject(new Error('aborted'))
        return
      }
      if (!existsSync(cwd)) {
        reject(new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`))
        return
      }
      ensureRuntime(runbox)
        .then((runtime) => {
          if (!runtime?.shell) {
            reject(new Error(`Exec sandbox unavailable: ${runtime?.reason || 'no runtime'}`))
            return
          }
          const writable = [...writableRoots, ...(tempDir ? [tempDir] : [])]
          const args = buildRunboxArgs({
            writableRoots: writable,
            readonlyRoots: [runtime.runtimeRoot, ...readonlyRoots],
            shell: runtime.shell,
            shellArgs: runtime.shellArgs,
            command,
            cwd,
          })
          const child = spawn(runbox, args, {
            cwd,
            env: { ...sanitizeChildEnvironment(env, cwd), ...runtime.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
          })
          let timedOut = false
          let settled = false
          let timeoutHandle
          const finish = (fn, value) => {
            if (settled) return
            settled = true
            if (timeoutHandle) clearTimeout(timeoutHandle)
            fn(value)
          }
          const onAbort = () => {
            killTree(child.pid)
          }
          if (timeout !== undefined) {
            if (!Number.isFinite(timeout) || timeout <= 0) {
              finish(reject, new Error('Invalid timeout: must be a finite number of seconds'))
              return
            }
            const timeoutMs = Math.min(timeout * 1000, 2_147_483_647)
            timeoutHandle = setTimeout(() => {
              timedOut = true
              killTree(child.pid)
            }, timeoutMs)
          }
          child.stdout?.on('data', (chunk) => onData?.(chunk))
          child.stderr?.on('data', (chunk) => onData?.(chunk))
          if (signal) signal.addEventListener('abort', onAbort, { once: true })
          child.on('error', (error) => finish(reject, error))
          child.on('close', (code, signalName) => {
            if (signal) signal.removeEventListener('abort', onAbort)
            if (signal?.aborted) {
              finish(reject, new Error('aborted'))
              return
            }
            if (timedOut) {
              finish(reject, new Error(`timeout:${timeout}`))
              return
            }
            finish(resolvePromise, { exitCode: code ?? (signalName ? 137 : 1) })
          })
        })
        .catch((error) => reject(error))
    })

  return { exec, runbox }
}
