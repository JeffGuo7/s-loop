// v4 -> 1.4 session migration: legacy files (first line {v:4,kind:"header"},
// entries under per-cwd subdirectories) must surface through the 1.4 repo
// with their conversation intact, idempotently and without touching the
// originals.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { createSessionRepo, findSession } = await import('../session-store.mjs')

function makeDataDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sloop-v4-migrate-${tag}-`))
}

function writeLegacySession(dataDir, id, entries) {
  const cwdDir = path.join(dataDir, '.s-loop', 'sessions', '--legacy-cwd--')
  fs.mkdirSync(cwdDir, { recursive: true })
  const file = path.join(cwdDir, `2026-01-01T00-00-00-000Z_${id}.jsonl`)
  const lines = [
    JSON.stringify({ v: 4, kind: 'header', id, storageVersion: 1, createdAt: 1767225600000, cwd: 'C:\\legacy\\cwd' }),
    JSON.stringify({ kind: 'value', op: 'set', seq: 1, namespace: 'pi.branch.tip', key: 'main', value: null }),
    ...entries,
  ]
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

function v4Message(id, parentId, role, text, ts) {
  return JSON.stringify([
    { kind: 'entry', id, parentId, type: 'message', message: { role, content: [{ type: 'text', text }], timestamp: ts }, seq: 2, timestamp: ts },
    { kind: 'v2-entry', seq: 3 },
  ])
}

test('migrates a legacy v4 session and restores its messages', async (t) => {
  const dataDir = makeDataDir('basic')
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  const legacy = writeLegacySession(dataDir, 'aaaa1111-0000-4000-8000-000000000001', [
    v4Message('e1', null, 'user', '看看这周有哪些 ai 资讯', 1767225601000),
    v4Message('e2', 'e1', 'assistant', '本周要点：……', 1767225602000),
  ])

  const repo = createSessionRepo(dataDir)
  const list = await repo.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'aaaa1111-0000-4000-8000-000000000001')
  assert.equal(list[0].cwd, 'C:\\legacy\\cwd')

  const session = await repo.open(list[0])
  const context = await session.buildContext()
  assert.equal(context.messages.length, 2)
  assert.equal(context.messages[0].role, 'user')
  assert.deepEqual(
    context.messages.map((m) => m.content?.[0]?.text),
    ['看看这周有哪些 ai 资讯', '本周要点：……'],
  )

  // Original file untouched; converted file sits at the sessions root.
  assert.ok(fs.existsSync(legacy))
  const root = path.join(dataDir, '.s-loop', 'sessions')
  assert.ok(fs.existsSync(path.join(root, path.basename(legacy))))

  // Idempotent: a second repo run does not duplicate the session.
  const repo2 = createSessionRepo(dataDir)
  assert.equal((await repo2.list()).length, 1)
})

test('compaction summaries and retained tails survive as messages', async (t) => {
  const dataDir = makeDataDir('compaction')
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  writeLegacySession(dataDir, 'bbbb2222-0000-4000-8000-000000000002', [
    v4Message('e1', null, 'user', 'early question', 1767225601000),
    JSON.stringify([
      { kind: 'entry', id: 'c1', parentId: 'e1', type: 'compaction', summary: 'Earlier work summary', tokensBefore: 5000, timestamp: 1767225603000, retainedTail: [
        { role: 'user', content: [{ type: 'text', text: 'kept tail message' }], timestamp: 1767225604000 },
      ] },
      { kind: 'v2-entry' },
    ]),
    v4Message('e3', 'c1', 'assistant', 'final answer', 1767225605000),
  ])

  const repo = createSessionRepo(dataDir)
  const list = await repo.list()
  assert.equal(list.length, 1)
  const context = await (await repo.open(list[0])).buildContext()
  const texts = context.messages.map((m) => m.content?.[0]?.text)
  assert.ok(texts.some((text) => /Earlier work summary/.test(String(text))), 'compaction summary preserved')
  assert.ok(texts.includes('kept tail message'), 'retained tail preserved')
  assert.ok(texts.includes('final answer'), 'post-compaction messages preserved')
})

test('header-only legacy files and 1.4 files are left alone', async (t) => {
  const dataDir = makeDataDir('skip')
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  writeLegacySession(dataDir, 'cccc3333-0000-4000-8000-000000000003', [])

  // An existing 1.4 file must not be reprocessed or duplicated.
  const root = path.join(dataDir, '.s-loop', 'sessions')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, '2026-02-02_x.jsonl'), JSON.stringify({ type: 'session', id: 'dddd4444-0000-4000-8000-000000000004' }) + '\n')

  const repo = createSessionRepo(dataDir)
  const list = await repo.list()
  assert.deepEqual(list.map((m) => m.id).sort(), ['dddd4444-0000-4000-8000-000000000004'])
})
