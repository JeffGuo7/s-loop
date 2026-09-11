// PPTX generation + inspection tools for S-Loop agents.
//
// create_pptx: runs an agent-authored pptxgenjs script in a child node process.
//   The wrapper lives under SERVER_DIR/pptx-jobs/ so `import 'pptxgenjs'`
//   resolves from pi-server's own node_modules (the sandbox strips NODE_PATH).
//   The output path is injected via the PPTX_OUTPUT_PATH env var so user paths
//   never get embedded in generated code.
// inspect_pptx / renderPptxHtml: drive the OfficeCLI binary (Apache-2.0,
//   installed via @officecli/officecli into <pkg>/vendor/) for machine
//   validation and high-fidelity HTML rendering. All failures degrade to
//   readable text so agents and the preview panel can fall back gracefully.

import { spawn, execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkWorkspacePath, sanitizeChildEnvironment } from './sandbox.mjs'

const SCRIPT_TIMEOUT_MS = 120_000
const INSPECT_TIMEOUT_MS = 120_000
const RENDER_TIMEOUT_MS = 200_000
const MAX_SCRIPT_BYTES = 1_000_000

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

let officecliModulePromise = null
function loadOfficecli() {
  if (!officecliModulePromise) {
    // Default import: the package main is a CJS installer module exposing
    // { binaryPath, ensureBinary }.
    officecliModulePromise = import('@officecli/officecli')
  }
  return officecliModulePromise
}

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    // SIGTERM does not terminate child trees on Windows.
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {})
  } else {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
  }
}

function collectChild(child, timeoutMs, signal) {
  return new Promise((resolve) => {
    const stdout = []
    const stderr = []
    let timedOut = false
    const stop = () => {
      timedOut = true
      killTree(child)
    }
    const timer = setTimeout(() => stop(), timeoutMs)
    if (signal) {
      if (signal.aborted) stop()
      else signal.addEventListener('abort', stop, { once: true })
    }
    const finish = (result) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
      resolve(result)
    }
    child.stdout?.on('data', (c) => stdout.push(c))
    child.stderr?.on('data', (c) => stderr.push(c))
    child.on('error', (err) => {
      finish({ code: null, stdout: '', stderr: '', timedOut: false, aborted: signal?.aborted === true, spawnError: err })
    })
    child.on('close', (code) => {
      finish({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        aborted: signal?.aborted === true,
        spawnError: null,
      })
    })
  })
}

async function invokeOfficeCli(binPath, args, timeoutMs, signal) {
  const child = spawn(binPath, args, {
    windowsHide: true,
    env: {
      ...sanitizeChildEnvironment(process.env, process.cwd()),
      OFFICECLI_SKIP_UPDATE: '1',
      // One-shot invocations must not leave resident servers holding file
      // locks (and job temp dirs) open after the command returns.
      OFFICECLI_NO_AUTO_RESIDENT: '1',
    },
  })
  const result = await collectChild(child, timeoutMs, signal)
  if (result.spawnError) {
    const err = result.spawnError
    return {
      unavailable: true,
      error: err?.code === 'ENOENT'
        ? 'officecli binary is missing on this machine.'
        : `Failed to launch officecli: ${err?.message || err}`,
    }
  }
  if (result.aborted) {
    return { aborted: true, error: 'officecli invocation was aborted' }
  }
  if (result.timedOut) {
    return { error: `officecli timed out after ${Math.round(timeoutMs / 1000)}s` }
  }
  return { code: result.code, stdout: result.stdout, stderr: result.stderr }
}

async function runOfficeCli(args, timeoutMs, { officecli, signal } = {}) {
  let binPath
  try {
    const mod = officecli ? { binaryPath: officecli.binaryPath, ensureBinary: officecli.ensureBinary } : await loadOfficecli()
    binPath = mod.binaryPath()
    if (!fs.existsSync(binPath) && mod.ensureBinary) {
      binPath = await mod.ensureBinary()
    }
  } catch (err) {
    return { unavailable: true, error: `officecli is not installed: ${err?.message || err}` }
  }

  let result = await invokeOfficeCli(binPath, args, timeoutMs, signal)
  // The self-contained binary can fail its very first invocation while the
  // runtime bundle is still extracting (crash with empty stdout). One retry
  // covers that transient; the retry is cheap once extraction is warm. A
  // timed-out or aborted run must never be retried (it would double the
  // worst-case latency).
  if (
    !result.unavailable
    && !result.aborted
    && typeof result.code === 'number'
    && result.code !== 0
    && !result.stdout?.trim()
  ) {
    result = await invokeOfficeCli(binPath, args, timeoutMs, signal)
  }
  return result
}

export const RESULT_SENTINEL = '__SLOOP_PPTX_RESULT__'

function wrapperPrelude() {
  return `import PptxGenJS from 'pptxgenjs'
import * as fs from 'node:fs'
import * as path from 'node:path'

const __logs = []
for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level].bind(console)
  console[level] = (...args) => {
    __logs.push(args.map(a => {
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch { return String(a) }
    }).join(' '))
    original(...args)
  }
}

const OUT = process.env.PPTX_OUTPUT_PATH
if (!OUT) {
  console.error('PPTX_OUTPUT_PATH is not set')
  process.exit(1)
}

// Ready-to-use presentation instance. Build slides on it; do not redeclare it
// and do not call writeFile — the harness writes the file after your script.
const pptx = new PptxGenJS()
`
}

function wrapperEpilogue() {
  return `
const __deck = globalThis.__pptx || pptx
if (!(__deck && typeof __deck.writeFile === 'function')) {
  console.error('No presentation instance is available to write.')
  process.exit(1)
}
await fs.mkdirSync(path.dirname(OUT), { recursive: true })
await __deck.writeFile({ fileName: OUT })
process.stdout.write('\\n${RESULT_SENTINEL}' + JSON.stringify({ ok: true, outputPath: OUT }))
`
}

export function buildJobScript(userScript) {
  return `${wrapperPrelude()}
try {
${userScript}
} catch (err) {
  console.error('Script error:', err?.stack || err?.message || String(err))
  process.exit(1)
}
${wrapperEpilogue()}
`
}

async function runCreatePptx(params, { workspaceDir, workspaceRoots, jobsDir, spawnImpl }) {
  const script = typeof params.script === 'string' ? params.script : ''
  const outputPath = typeof params.outputPath === 'string' ? params.outputPath : ''
  if (!script.trim()) {
    return { ok: false, error: 'script is required (JavaScript using pptxgenjs).' }
  }
  if (!outputPath.trim()) {
    return { ok: false, error: 'outputPath is required (relative to the workspace, e.g. decks/report.pptx).' }
  }
  if (Buffer.byteLength(script, 'utf8') > MAX_SCRIPT_BYTES) {
    return { ok: false, error: 'script is too large (max 1 MB).' }
  }
  if (!/\.pptx$/i.test(outputPath.trim())) {
    return { ok: false, error: 'outputPath must end with .pptx' }
  }

  // Let the sandbox helper do the resolution (~ expansion, canonicalization)
  // so the tool agrees with the policy layer on secondary workspace roots.
  const access = checkWorkspacePath(outputPath.trim(), workspaceDir, workspaceRoots || [], 'read-write')
  if (!access.allowed) {
    return { ok: false, error: `outputPath is not writable inside the workspace: ${access.reason}` }
  }
  const absOutput = access.resolvedPath || path.resolve(workspaceDir, outputPath.trim())

  fs.mkdirSync(jobsDir, { recursive: true })
  const jobFile = path.join(jobsDir, `job-${randomUUID()}.mjs`)
  fs.writeFileSync(jobFile, buildJobScript(script), 'utf8')

  const child = spawnImpl(process.execPath, [jobFile], {
    cwd: workspaceDir,
    windowsHide: true,
    env: {
      ...sanitizeChildEnvironment(process.env, workspaceDir),
      PPTX_OUTPUT_PATH: access.resolvedPath || absOutput,
    },
  })

  try {
    const result = await collectChild(child, SCRIPT_TIMEOUT_MS)
    if (result.timedOut) {
      return { ok: false, error: `PPTX script timed out after ${Math.round(SCRIPT_TIMEOUT_MS / 1000)}s`, consoleLog: result.stdout }
    }
    if (result.spawnError) {
      return { ok: false, error: `Failed to launch node: ${result.spawnError?.message || result.spawnError}` }
    }
    const sentinelIdx = result.stdout.indexOf(RESULT_SENTINEL)
    if (result.code === 0 && sentinelIdx !== -1) {
      const jsonPart = result.stdout.slice(sentinelIdx + RESULT_SENTINEL.length).trim()
      let parsed = {}
      try { parsed = JSON.parse(jsonPart) } catch { /* fall through to generic success */ }
      return {
        ok: true,
        outputPath: parsed.outputPath || absOutput,
        consoleLog: result.stdout.slice(0, sentinelIdx).trim(),
      }
    }
    const errText = (result.stderr || result.stdout || 'Unknown error').trim()
    return { ok: false, error: errText.slice(0, 8000), consoleLog: result.stdout.slice(0, 4000) }
  } finally {
    await fs.promises.rm(jobFile, { force: true }).catch(() => {})
  }
}

async function runInspectPptx(params, { workspaceDir, workspaceRoots, deps }) {
  const rawPath = typeof params.path === 'string' ? params.path : ''
  if (!rawPath.trim()) {
    return { ok: false, unavailable: false, text: 'path is required (relative to the workspace or absolute).' }
  }
  const access = checkWorkspacePath(rawPath.trim(), workspaceDir, workspaceRoots || [], 'read')
  if (!access.allowed) {
    return { ok: false, unavailable: false, text: `Cannot inspect paths outside the workspace sandbox: ${access.reason}` }
  }
  const absPath = access.resolvedPath
  if (!fs.existsSync(absPath)) {
    return { ok: false, unavailable: false, text: `File not found: ${absPath}` }
  }

  const sections = []

  const [issues, validation] = await Promise.all([
    runOfficeCli(['view', absPath, 'issues', '--json'], INSPECT_TIMEOUT_MS, deps),
    runOfficeCli(['validate', absPath, '--json'], INSPECT_TIMEOUT_MS, deps),
  ])
  if (issues.unavailable) {
    return {
      ok: false,
      unavailable: true,
      text: 'officecli is unavailable on this machine, so automated inspection was skipped. Verify the deck by opening it in PowerPoint.',
    }
  }
  sections.push('## Layout & content issues (officecli view issues)\n' + (issues.stdout.trim() || issues.stderr.trim() || 'No issues reported.'))
  sections.push('## OOXML validation (officecli validate)\n' + (validation.stdout.trim() || validation.stderr.trim() || 'Valid.'))

  return { ok: true, unavailable: false, text: sections.join('\n\n') }
}

export async function renderPptxHtml(absPath, outPath, deps = {}, signal) {
  const result = await runOfficeCli(['view', absPath, 'html', '-o', outPath], RENDER_TIMEOUT_MS, { ...deps, signal })
  const stdoutHtml = result.stdout?.trim() || ''
  if (result.code !== 0) {
    // A crashed run can still print the rendered document to stdout — use it
    // rather than failing the preview, but only when it looks complete (a
    // partial flush would silently truncate the deck).
    if (/^<!doctype html|^<html/i.test(stdoutHtml) && /<\/html>\s*$/i.test(stdoutHtml)) {
      fs.writeFileSync(outPath, stdoutHtml, 'utf8')
      return outPath
    }
    const detail = result.error || result.stderr?.trim() || `officecli exited with code ${result.code}`
    const err = new Error(detail)
    err.unavailable = result.unavailable === true
    throw err
  }
  return outPath
}

export function createPptxTools({ workspaceDir, serverDir, workspaceRoots, deps = {} } = {}) {
  const root = workspaceDir || process.cwd()
  const roots = workspaceRoots
  const jobsDir = path.join(serverDir || MODULE_DIR, 'pptx-jobs')
  const spawnImpl = deps.spawnImpl || spawn

  return [
    {
      name: 'create_pptx',
      label: 'Create PPTX',
      description:
        'Generate a native, fully editable PowerPoint (.pptx) file by running a Node.js script against a ready-to-use pptxgenjs presentation instance exposed as the global `pptx`. ' +
        'Write ONE script that builds the whole deck with explicit layout coordinates (16:9 canvas is 10 x 5.625 inches): set pptx.layout, call pptx.addSlide()/addText/addShape/addImage/addTable/addChart. ' +
        'Do NOT redeclare `pptx` and do NOT call writeFile — the file is written automatically to outputPath after your script returns. ' +
        'Always run inspect_pptx on the result afterwards and fix every reported issue.',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'JavaScript (ESM) that builds slides on the provided `pptx` instance, e.g. `pptx.layout = "LAYOUT_16x9"; const slide = pptx.addSlide(); slide.addText("Title", { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 28, bold: true });`' },
          outputPath: { type: 'string', description: 'Where to save the deck, relative to the workspace root (must end with .pptx), e.g. decks/report.pptx' },
        },
        required: ['script', 'outputPath'],
      },
      execute: async (_id, params) => {
        const result = await runCreatePptx(params, { workspaceDir: root, workspaceRoots: roots, jobsDir, spawnImpl })
        const text = result.ok
          ? `PPTX created: ${result.outputPath}${result.consoleLog ? `\n\nScript output:\n${result.consoleLog}` : ''}`
          : `PPTX generation failed: ${result.error}${result.consoleLog ? `\n\nScript output:\n${result.consoleLog}` : ''}`
        return { content: [{ type: 'text', text }], details: result }
      },
    },
    {
      name: 'inspect_pptx',
      label: 'Inspect PPTX',
      description:
        'Inspect a .pptx file for problems: layout issues (text overflow, overlaps) and OOXML schema validation. ' +
        'Run this after create_pptx (and after every fix) and repair all reported issues before delivering the deck to the user.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the .pptx file, relative to the workspace root or absolute' },
        },
        required: ['path'],
      },
      execute: async (_id, params) => {
        const result = await runInspectPptx(params, { workspaceDir: root, workspaceRoots: roots, deps })
        return {
          content: [{ type: 'text', text: result.text }],
          details: { ok: result.ok, unavailable: result.unavailable === true },
        }
      },
    },
  ]
}
