import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { seedBuiltinSkills } from '../builtin-skills.mjs'

const PI_SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sloop-seed-home-'))
}

test('seeds bundled skills into the pi skills directory', () => {
  const home = makeTempHome()
  try {
    const seeded = seedBuiltinSkills(PI_SERVER_DIR, home, (() => {}))
    assert.ok(seeded.includes('make-pptx'), 'make-pptx skill must be bundled')

    const dest = path.join(home, '.pi', 'agent', 'skills', 'make-pptx', 'SKILL.md')
    assert.ok(fs.existsSync(dest))
    const content = fs.readFileSync(dest, 'utf8')
    assert.match(content, /^---\nname: make-pptx/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('never overwrites an existing skill with the same name', () => {
  const home = makeTempHome()
  try {
    const skillDir = path.join(home, '.pi', 'agent', 'skills', 'make-pptx')
    fs.mkdirSync(skillDir, { recursive: true })
    const dest = path.join(skillDir, 'SKILL.md')
    fs.writeFileSync(dest, '---\nname: make-pptx\ndescription: user edit\n---\nkeep me')

    const seeded = seedBuiltinSkills(PI_SERVER_DIR, home, (() => {}))
    assert.ok(!seeded.includes('make-pptx'), 'existing skill must not be reseeded')
    assert.match(fs.readFileSync(dest, 'utf8'), /keep me/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('tolerates a missing builtin-skills directory', () => {
  const seeded = seedBuiltinSkills(path.join(os.tmpdir(), 'definitely-not-here-xyz'), makeTempHome(), (() => {}))
  assert.deepEqual(seeded, [])
})

test('refreshes an unmodified seeded skill when a new version ships', () => {
  const home = makeTempHome()
  try {
    const skillDir = path.join(home, '.pi', 'agent', 'skills', 'make-pptx')
    fs.mkdirSync(skillDir, { recursive: true })
    const dest = path.join(skillDir, 'SKILL.md')
    fs.writeFileSync(dest, '---\nname: make-pptx\ndescription: old bundled version\n---\nold')
    fs.writeFileSync(
      path.join(skillDir, '.sloop-bundled'),
      createHash('sha256').update(fs.readFileSync(dest)).digest('hex') + '\n',
    )

    const seeded = seedBuiltinSkills(PI_SERVER_DIR, home, (() => {}))
    assert.ok(seeded.includes('make-pptx'), 'unmodified seeded skill must be refreshed')
    assert.match(fs.readFileSync(dest, 'utf8'), /^---\nname: make-pptx/)
    assert.doesNotMatch(fs.readFileSync(dest, 'utf8'), /old bundled version/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('keeps user edits even when a new version ships', () => {
  const home = makeTempHome()
  try {
    const skillDir = path.join(home, '.pi', 'agent', 'skills', 'make-pptx')
    fs.mkdirSync(skillDir, { recursive: true })
    const dest = path.join(skillDir, 'SKILL.md')
    fs.writeFileSync(dest, '---\nname: make-pptx\ndescription: user tweak\n---\nkeep me')
    fs.writeFileSync(
      path.join(skillDir, '.sloop-bundled'),
      createHash('sha256').update('old bundled content').digest('hex') + '\n',
    )

    const seeded = seedBuiltinSkills(PI_SERVER_DIR, home, (() => {}))
    assert.ok(!seeded.includes('make-pptx'), 'user-edited skill must never be overwritten')
    assert.match(fs.readFileSync(dest, 'utf8'), /keep me/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
