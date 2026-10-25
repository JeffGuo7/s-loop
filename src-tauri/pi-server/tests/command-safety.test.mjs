// Command-safety pattern tests, focused on the Windows-side gaps: PowerShell
// and cmd equivalents of the Unix destruction commands must be caught with the
// same two-tier structure (hardline vs approval-required).

import test from 'node:test'
import assert from 'node:assert/strict'
import { checkHardlineCommand, checkDangerousCommand, checkCommandSafety } from '../security.mjs'

test('hardline blocks irreversible destruction on every shell', () => {
  const unix = ['rm -rf /', 'mkfs.ext4 /dev/sda1', 'dd if=x of=/dev/sda', 'shutdown now']
  const windows = ['format C:', 'diskpart', 'Format-Volume -DriveLetter C', 'Clear-Disk -Number 0']
  for (const cmd of [...unix, ...windows]) {
    const result = checkHardlineCommand(cmd)
    assert.equal(result.blocked, true, `expected hardline block: ${cmd}`)
    assert.equal(checkCommandSafety(cmd).allowed, false)
  }
})

test('windows recursive deletes are dangerous (approval), not silently allowed', () => {
  const commands = [
    'rd /s /q build',
    'del /f /s /q temp\\*',
    'Remove-Item -Recurse -Force node_modules',
    'powershell Remove-Item -Path .\\dist -Recurse',
  ]
  for (const cmd of commands) {
    assert.equal(checkHardlineCommand(cmd).blocked, false, `should not be hardline: ${cmd}`)
    assert.equal(checkDangerousCommand(cmd).dangerous, true, `expected dangerous: ${cmd}`)
    assert.equal(checkCommandSafety(cmd).allowed, false)
  }
})

test('ordinary windows commands stay allowed', () => {
  for (const cmd of ['dir', 'Remove-Item stale.tmp', 'del notes.txt', 'echo hello']) {
    assert.deepEqual(checkCommandSafety(cmd), { allowed: true }, `should be allowed: ${cmd}`)
  }
})
