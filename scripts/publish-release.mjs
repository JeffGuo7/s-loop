#!/usr/bin/env node
/**
 * Publish a GitHub Release with bundled installers.
 *
 * Flow:
 *   1. Read version from tauri.conf.json
 *   2. npm run build        (tsc + vite + pack pi-server.zip)
 *   3. npm run tauri:build  (Rust release + NSIS + MSI)
 *   4. Locate installer artifacts under src-tauri/target/release/bundle
 *   5. Authenticate gh via cached git credential (GH_TOKEN, no interactive login)
 *   6. Create GitHub Release and upload installers as assets
 *
 * Usage:
 *   node scripts/publish-release.mjs                       # tag v<version>, prerelease if version has -alpha/-beta/-rc
 *   node scripts/publish-release.mjs --tag v0.2.0          # custom tag
 *   node scripts/publish-release.mjs --target master       # target branch/sha (default: current HEAD)
 *   node scripts/publish-release.mjs --no-build            # skip build steps, publish existing artifacts
 *   node scripts/publish-release.mjs --notes "..."         # custom release notes
 *   node scripts/publish-release.mjs --latest              # mark as latest (not prerelease)
 *
 * Requires: git remote origin on github.com, gh CLI installed, cached git credential with repo scope.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'))
const TAIL = (n = 40) => n

// ─── helpers ──────────────────────────────────────────────

function run(cmd, { cwd = ROOT, stdio = 'inherit', env } = {}) {
  return spawnSync(cmd, { cwd, stdio, env, shell: true })
}

function runOut(cmd, { cwd = ROOT, env } = {}) {
  const r = spawnSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env, shell: true, encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`command failed: ${cmd}\n${r.stderr || r.stdout}`)
  }
  return (r.stdout || '').trim()
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function parseArgs(argv) {
  const args = { tag: null, target: null, notes: null, noBuild: false, latest: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tag') args.tag = argv[++i]
    else if (a === '--target') args.target = argv[++i]
    else if (a === '--notes') args.notes = argv[++i]
    else if (a === '--no-build') args.noBuild = true
    else if (a === '--latest') args.latest = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '-h' || a === '--help') {
      console.log(USAGE)
      process.exit(0)
    } else {
      console.error(`unknown arg: ${a}`)
      console.error(USAGE)
      process.exit(2)
    }
  }
  return args
}

const USAGE = `Usage: node scripts/publish-release.mjs [options]

  --tag <name>       custom release tag (default: v<version>)
  --target <ref>     target branch or sha (default: current HEAD)
  --notes <text>     custom release notes (default: generated)
  --no-build         skip npm build + tauri build, publish existing artifacts
  --latest           mark as latest release (not prerelease)
  --dry-run          validate everything but do not create the release
  -h, --help         show this help`

// ─── steps ────────────────────────────────────────────────

function readVersion() {
  const conf = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'))
  const v = conf.version
  if (!v) throw new Error('version not found in src-tauri/tauri.conf.json')
  return v
}

function isPrerelease(version) {
  return /-(alpha|beta|rc|pre|dev)/i.test(version)
}

function locateInstallers() {
  const base = join(ROOT, 'src-tauri', 'target', 'release', 'bundle')
  const candidates = [
    { kind: 'NSIS', dir: 'nsis', pattern: /^S-Loop_.*-setup\.exe$/i },
    { kind: 'MSI', dir: 'msi', pattern: /^S-Loop_.*\.msi$/i },
  ]
  const found = []
  for (const c of candidates) {
    const dir = join(base, c.dir)
    if (!existsSync(dir)) {
      console.warn(`[publish] WARN: ${c.kind} bundle dir missing: ${dir}`)
      continue
    }
    const files = readdirSync(dir).filter(f => c.pattern.test(f))
    if (!files.length) {
      console.warn(`[publish] WARN: no ${c.kind} installer found in ${dir}`)
      continue
    }
    // pick the most recent matching file
    const pick = files.map(f => ({ f, mtime: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime)[0]
    found.push({ kind: c.kind, path: join(dir, pick.f), size: statSync(join(dir, pick.f)).size })
  }
  return found
}

function buildAll() {
  console.log('[publish] step 1/4: npm run build (tsc + vite + pack pi-server.zip)')
  const r1 = run('npm run build')
  if (r1.status !== 0) { console.error('[publish] npm run build failed'); process.exit(1) }

  console.log('[publish] step 2/4: npm run tauri:build (Rust release + NSIS + MSI)')
  const r2 = run('npm run tauri:build')
  if (r2.status !== 0) { console.error('[publish] npm run tauri:build failed'); process.exit(1) }
}

function resolveGh() {
  // prefer the standard winget install location (avoids shell/PATH quoting issues)
  for (const p of ['C:\\Program Files\\GitHub CLI\\gh.exe', 'C:\\Program Files (x86)\\GitHub CLI\\gh.exe']) {
    if (existsSync(p)) return p
  }
  // fall back to PATH lookup — on git-bash `which gh` returns a unix path; convert to windows
  const which = spawnSync('where', ['gh'], { shell: true, encoding: 'utf8' })
  if (which.status === 0) {
    const found = which.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0]
    if (found && existsSync(found)) return found
  }
  throw new Error('gh CLI not found. Install via: winget install GitHub.cli')
}

// run gh without a shell so paths with spaces survive; args passed as an array
function ghRun(gh, args, { token, captureStdio = true } = {}) {
  const stdio = captureStdio ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit']
  return spawnSync(gh, args, {
    cwd: ROOT, stdio, encoding: captureStdio ? 'utf8' : null,
    env: { ...process.env, GH_TOKEN: token },
  })
}

function ghToken() {
  // reuse cached git credential — same token that git push uses, no interactive login
  const input = 'protocol=https\nhost=github.com\n\n'
  const r = spawnSync('git', ['credential', 'fill'], { input, shell: true, encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git credential fill failed')
  const m = r.stdout.match(/^password=(.+)$/m)
  if (!m) throw new Error('no password in git credential — run `git push` once to cache it')
  return m[1].trim()
}

function defaultNotes(version) {
  return `## S-Loop v${version}

### 安装包

- **NSIS**: \`S-Loop_${version}_x64-setup.exe\` — per-user 安装,无需管理员权限,默认装到 \`%LOCALAPPDATA%\\S-Loop\`
- **MSI**: \`S-Loop_${version}_x64_en-US.msi\` — 系统级安装

### 首次启动

安装包内嵌 \`pi-server.zip\`,首次启动时由应用自动解压到安装目录并拉起 pi-server(本地 4096 端口)。无需额外配置。

### 系统要求

- Windows 10/11 x64
- 首启需写入权限(解压 pi-server.zip 到安装目录)
`
}

function createRelease({ tag, target, notes, prerelease, installers, gh, token }) {
  const args = ['release', 'create', tag]
  if (target) { args.push('--target'); args.push(target) }
  args.push('--title', `S-Loop ${tag}`)
  if (prerelease) args.push('--prerelease')
  args.push('--notes', notes)
  for (const ins of installers) args.push(ins.path)

  const r = ghRun(gh, args, { token })
  if (r.status !== 0) {
    console.error('[publish] gh release create failed:')
    console.error(r.stderr || r.stdout)
    process.exit(1)
  }
  return (r.stdout || '').trim()
}

// ─── main ─────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2))
  const version = readVersion()
  const tag = args.tag || `v${version}`
  const prerelease = args.latest ? false : isPrerelease(version)

  console.log(`[publish] version=${version} tag=${tag} prerelease=${prerelease}`)

  // verify remote is github
  const remote = runOut('git remote get-url origin')
  if (!/github\.com/.test(remote)) {
    throw new Error(`origin is not a github remote: ${remote}`)
  }

  if (!args.noBuild) {
    buildAll()
  } else {
    console.log('[publish] --no-build: skipping build steps')
  }

  console.log('[publish] step 3/4: locate installers')
  const installers = locateInstallers()
  if (!installers.length) {
    console.error('[publish] no installers found. Run without --no-build, or run `npm run tauri:build` first.')
    process.exit(1)
  }
  for (const ins of installers) {
    console.log(`  ${ins.kind}: ${ins.path} (${humanSize(ins.size)})`)
  }

  const target = args.target || runOut('git rev-parse HEAD')
  const notes = args.notes || defaultNotes(version)
  const gh = resolveGh()
  const token = ghToken()

  // sanity: token authenticates
  const auth = ghRun(gh, ['auth', 'status'], { token })
  if (auth.status !== 0) {
    console.error('[publish] gh auth failed via cached token:')
    console.error(auth.stderr || auth.stdout)
    console.error('hint: run `git push` once to cache a github credential with repo scope')
    process.exit(1)
  }

  console.log(`[publish] step 4/4: create release ${tag} (target ${target.slice(0, 7)})`)
  if (args.dryRun) {
    console.log('[publish] --dry-run: stopping before release creation')
    console.log(`  would create tag=${tag} prerelease=${prerelease} target=${target}`)
    for (const ins of installers) console.log(`  would upload: ${ins.path} (${humanSize(ins.size)})`)
    return
  }
  const url = createRelease({ tag, target, notes, prerelease, installers, gh, token })
  console.log(`\n[publish] done → ${url}`)
  for (const ins of installers) {
    console.log(`  asset: ${ins.path}`)
  }
}

main()
