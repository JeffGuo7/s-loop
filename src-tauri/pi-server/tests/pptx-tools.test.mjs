import assert from 'node:assert/strict'
import test from 'node:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateToolCall } from '../execution-policy.mjs'
import { buildToolSecurityIndex } from '../tool-security.mjs'
import {
  buildJobScript,
  createPptxTools,
  RESULT_SENTINEL,
  renderPptxHtml,
} from '../pptx-tools.mjs'

const PI_SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TOOL_SECURITY = buildToolSecurityIndex(createPptxTools({
  workspaceDir: PI_SERVER_DIR,
  serverDir: PI_SERVER_DIR,
}))

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sloop-pptx-test-'))
}

test('create_pptx and inspect_pptx carry trusted security metadata', () => {
  assert.ok(TOOL_SECURITY.has('create_pptx'), 'create_pptx must be registered')
  assert.ok(TOOL_SECURITY.has('inspect_pptx'), 'inspect_pptx must be registered')

  const createMeta = TOOL_SECURITY.get('create_pptx')
  assert.equal(createMeta.risk, 'exec')
  assert.deepEqual(createMeta.pathArguments, ['outputPath'])

  const inspectMeta = TOOL_SECURITY.get('inspect_pptx')
  assert.equal(inspectMeta.risk, 'read')
  assert.equal(inspectMeta.parallelSafe, true)
})

test('inspect_pptx in allow mode auto-approves inside the workspace', () => {
  const decision = evaluateToolCall(
    { name: 'inspect_pptx', arguments: { path: 'decks/report.pptx' } },
    { workspaceDir: process.cwd(), permissionMode: 'allow', toolSecurity: TOOL_SECURITY },
  )
  assert.equal(decision.outcome, 'allow')
  assert.equal(decision.risk, 'read')
})

test('create_pptx output paths are confined to the workspace', () => {
  const inside = evaluateToolCall(
    { name: 'create_pptx', arguments: { script: 'x', outputPath: 'decks/a.pptx' } },
    { workspaceDir: process.cwd(), permissionMode: 'allow', toolSecurity: TOOL_SECURITY },
  )
  assert.equal(inside.outcome, 'allow')

  const outside = evaluateToolCall(
    { name: 'create_pptx', arguments: { script: 'x', outputPath: '../escape.pptx' } },
    { workspaceDir: process.cwd(), permissionMode: 'allow', toolSecurity: TOOL_SECURITY },
  )
  assert.equal(outside.outcome, 'deny')
  assert.equal(outside.matchedRule, 'workspace-root')
})

test('in ask mode create_pptx requires explicit approval (exec risk)', () => {
  const decision = evaluateToolCall(
    { name: 'create_pptx', arguments: { script: 'x', outputPath: 'decks/a.pptx' } },
    { workspaceDir: process.cwd(), permissionMode: 'ask', toolSecurity: TOOL_SECURITY },
  )
  assert.equal(decision.outcome, 'approval-required')
  assert.equal(decision.risk, 'exec')
})

test('job wrapper pre-creates the instance and guards the output path', () => {
  const script = buildJobScript('pptx.layout = "LAYOUT_16x9"')
  assert.ok(script.includes("createRequire("))
  assert.ok(script.includes("nodeRequire('pptxgenjs')"))
  assert.ok(script.includes('const pptx = new PptxGenJS()'))
  assert.ok(script.includes('PPTX_OUTPUT_PATH'))
  assert.ok(script.includes('writeFile'))
  assert.ok(script.includes(RESULT_SENTINEL))
  assert.ok(script.includes('pptx.layout = "LAYOUT_16x9"'))
})

test('create_pptx rejects empty scripts and non-pptx output paths', async () => {
  const workspace = makeTempWorkspace()
  const [tool] = createPptxTools({ workspaceDir: workspace, serverDir: workspace })

  const noScript = await tool.execute('id', { script: '', outputPath: 'a.pptx' })
  assert.equal(noScript.details.ok, false)
  assert.match(noScript.content[0].text, /script is required/)

  const badExt = await tool.execute('id', { script: 'const x = 1', outputPath: 'decks/report.pdf' })
  assert.equal(badExt.details.ok, false)
  assert.match(badExt.content[0].text, /must end with \.pptx/)

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('create_pptx refuses output paths outside the workspace', async () => {
  const workspace = makeTempWorkspace()
  const [tool] = createPptxTools({ workspaceDir: workspace, serverDir: workspace })

  const result = await tool.execute('id', { script: 'const x = 1', outputPath: '../outside.pptx' })
  assert.equal(result.details.ok, false)
  assert.match(result.details.error, /not writable inside the workspace/)

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('create_pptx honors granted secondary workspace roots', async () => {
  const workspace = makeTempWorkspace()
  const secondRoot = makeTempWorkspace()
  const target = path.join(secondRoot, 'shared.pptx').replace(/\\/g, '/')

  const withoutRoots = createPptxTools({ workspaceDir: workspace, serverDir: workspace })[0]
  const denied = await withoutRoots.execute('id', { script: 'const x = 1', outputPath: target })
  assert.equal(denied.details.ok, false)

  const withRoots = createPptxTools({
    workspaceDir: workspace,
    serverDir: PI_SERVER_DIR,
    workspaceRoots: [{ path: secondRoot, access: 'read-write' }],
  })[0]
  const allowed = await withRoots.execute('id', { script: 'const x = 1', outputPath: target })
  assert.equal(allowed.details.ok, true, `expected success, got: ${allowed.content[0].text}`)
  assert.ok(fs.existsSync(target))

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  fs.rmSync(secondRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('create_pptx generates a real deck end to end', { timeout: 60_000 }, async () => {
  const workspace = makeTempWorkspace()
  const jobsDir = path.join(os.tmpdir(), 'sloop-pptx-jobs')
  fs.rmSync(jobsDir, { recursive: true, force: true })
  const [tool] = createPptxTools({ workspaceDir: workspace, serverDir: PI_SERVER_DIR })

  const script = [
    "pptx.layout = 'LAYOUT_16x9'",
    'const slide = pptx.addSlide()',
    "slide.addText('Hello S-Loop', { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 32, bold: true })",
  ].join('\n')

  const result = await tool.execute('id', { script, outputPath: 'decks/hello.pptx' })
  assert.equal(result.details.ok, true, `expected success, got: ${result.content[0].text}`)

  const written = path.join(workspace, 'decks', 'hello.pptx')
  assert.ok(fs.existsSync(written), 'deck file must exist')
  assert.ok(fs.statSync(written).size > 1000, 'deck file must be a non-trivial pptx')
  assert.equal(result.details.outputPath, written)

  // Job files must be cleaned up.
  const leftovers = fs.existsSync(jobsDir)
    ? fs.readdirSync(jobsDir).filter((f) => f.startsWith('job-'))
    : []
  assert.equal(leftovers.length, 0, 'job wrapper files must be removed after execution')

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('inspect_pptx reports file-not-found without touching officecli', async () => {
  const workspace = makeTempWorkspace()
  const [, inspect] = createPptxTools({
    workspaceDir: workspace,
    serverDir: workspace,
    deps: { officecli: { binaryPath: () => { throw new Error('must not be called') }, ensureBinary: async () => { throw new Error('must not be called') } } },
  })

  const result = await inspect.execute('id', { path: 'missing.pptx' })
  assert.equal(result.details.ok, false)
  assert.match(result.content[0].text, /File not found/)

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('inspect_pptx degrades to a readable message when officecli is unavailable', async () => {
  const workspace = makeTempWorkspace()
  const script = [
    "pptx.layout = 'LAYOUT_16x9'",
    'const slide = pptx.addSlide()',
    "slide.addText('Inspect me', { x: 0.5, y: 0.5, w: 9, h: 1 })",
  ].join('\n')
  const [create] = createPptxTools({ workspaceDir: workspace, serverDir: PI_SERVER_DIR })
  const created = await create.execute('id', { script, outputPath: 'deck.pptx' })
  assert.equal(created.details.ok, true)

  const [, inspect] = createPptxTools({
    workspaceDir: workspace,
    serverDir: workspace,
    deps: {
      officecli: {
        binaryPath: () => path.join(workspace, 'definitely-missing-officecli.exe'),
        ensureBinary: async () => path.join(workspace, 'definitely-missing-officecli.exe'),
      },
    },
  })

  const result = await inspect.execute('id', { path: 'deck.pptx' })
  assert.equal(result.details.ok, false)
  assert.equal(result.details.unavailable, true)
  assert.match(result.content[0].text, /unavailable/)

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('inspect_pptx runs the real officecli against a generated deck', { timeout: 120_000 }, async () => {
  const workspace = makeTempWorkspace()
  const [create, inspect] = createPptxTools({ workspaceDir: workspace, serverDir: PI_SERVER_DIR })

  const script = [
    "pptx.layout = 'LAYOUT_16x9'",
    'const slide = pptx.addSlide()',
    "slide.addText('Real inspection', { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 28, bold: true })",
  ].join('\n')
  const created = await create.execute('id', { script, outputPath: 'deck.pptx' })
  assert.equal(created.details.ok, true)

  const result = await inspect.execute('id', { path: 'deck.pptx' })
  assert.equal(result.details.ok, true, `inspect failed: ${result.content[0].text}`)
  assert.match(result.content[0].text, /view issues/)
  assert.match(result.content[0].text, /validate/)

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('renderPptxHtml produces HTML for a generated deck', { timeout: 240_000 }, async () => {
  const workspace = makeTempWorkspace()
  const outPath = path.join(workspace, 'render.html')
  const [create] = createPptxTools({ workspaceDir: workspace, serverDir: PI_SERVER_DIR })

  const script = [
    "pptx.layout = 'LAYOUT_16x9'",
    'const slide = pptx.addSlide()',
    "slide.addText('Render me', { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 28, bold: true })",
  ].join('\n')
  const created = await create.execute('id', { script, outputPath: 'deck.pptx' })
  assert.equal(created.details.ok, true)

  const htmlPath = await renderPptxHtml(path.join(workspace, 'deck.pptx'), outPath)
  const html = fs.readFileSync(htmlPath, 'utf8')
  assert.ok(html.length > 500, 'rendered HTML should be substantial')
  assert.match(html.toLowerCase(), /<(html|div|svg)/)

  fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})
