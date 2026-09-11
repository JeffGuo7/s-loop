// Seeds bundled SKILL.md folders into ~/.pi/agent/skills on pi-server startup
// so the frontend skill scan (which feeds agentSkillsBlock for chat and cron)
// discovers them.
//
// Update policy: a hidden marker records the hash of the bundled version we
// last installed. If the on-disk file still hashes to that marker, the user
// never edited it — a newer bundled version replaces it. If the hashes differ
// (or no marker exists), the file is user-owned and is never touched.

import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const MARKER_FILE = '.sloop-bundled'

function hashFile(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function seedBuiltinSkills(serverDir, homeDir = os.homedir(), log = console) {
  const builtinDir = path.join(serverDir, 'builtin-skills')
  let entries
  try {
    entries = fs.readdirSync(builtinDir, { withFileTypes: true })
  } catch {
    return []
  }
  const skillsRoot = path.join(homeDir, '.pi', 'agent', 'skills')
  const seeded = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const src = path.join(builtinDir, entry.name, 'SKILL.md')
    if (!fs.existsSync(src)) continue
    const destDir = path.join(skillsRoot, entry.name)
    const dest = path.join(destDir, 'SKILL.md')
    try {
      const bundledHash = hashFile(src)
      if (fs.existsSync(dest)) {
        const markerPath = path.join(destDir, MARKER_FILE)
        const lastSeededHash = fs.existsSync(markerPath)
          ? fs.readFileSync(markerPath, 'utf8').trim()
          : null
        const userOwnsFile = !lastSeededHash || hashFile(dest) !== lastSeededHash
        if (userOwnsFile || lastSeededHash === bundledHash) continue
      }
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, dest)
      fs.writeFileSync(path.join(destDir, MARKER_FILE), bundledHash + '\n', 'utf8')
      seeded.push(entry.name)
      log(`[pi-server] seeded builtin skill "${entry.name}" to ${dest}`)
    } catch (err) {
      log(`[pi-server] failed to seed skill "${entry.name}":`, err?.message || err)
    }
  }
  return seeded
}
