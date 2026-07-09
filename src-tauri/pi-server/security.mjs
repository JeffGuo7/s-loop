/**
 * Command safety checker — prevents the AI from running destructive commands.
 *
 * Two tiers, modelled after hermes-agent's approval pipeline:
 *   Tier 1 (hardline): Patterns that are ALWAYS blocked, even in 'allow' mode.
 *     These are irreversible destruction commands with no legitimate workflow use.
 *   Tier 2 (dangerous): Patterns that need explicit user approval in 'ask' mode.
 *     These are powerful but sometimes legitimate.
 *
 * Workspace jail: file-tool paths must stay within the workspace directory.
 * Sensitive host paths (~/.ssh, ~/.aws, ~/.kube, /etc/sudoers, /etc/shadow)
 * are denied for write operations regardless of workspace.
 */

// ── Tier 1: Hardline blocked (never allowed) ────────────────────────

const HARDLINE_PATTERNS = [
  // rm -rf / or rm -rf with critical paths
  { pattern: /\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*\s+|-[a-z]*f[a-z]*r[a-z]*\s+).*\/\b/, label: 'rm -rf on root' },
  { pattern: /\brm\s+(?:-[a-z]*rf?\s+|-[a-z]*fr?\s+).*\/etc\b/, label: 'rm destructive on /etc' },
  { pattern: /\brm\s+(?:-[a-z]*rf?\s+|-[a-z]*fr?\s+).*\/boot\b/, label: 'rm destructive on /boot' },

  // mkfs / format
  { pattern: /\bmkfs(?:\.[a-z]+)?\b/, label: 'mkfs (format a filesystem)' },
  { pattern: /\bdd\s+if=.*of=\/dev\//, label: 'dd to raw block device' },

  // System shutdown/deletion
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/, label: 'system shutdown/reboot' },
  { pattern: /\b(systemctl\s+(halt|poweroff|reboot|suspend))\b/, label: 'systemctl power command' },

  // Fork bomb
  { pattern: /:\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/, label: 'fork bomb' },

  // DEL / FORMAT on Windows
  { pattern: /\bformat\s+[A-Za-z]:/i, label: 'Windows format drive' },
  { pattern: /\b(diskpart|fdisk)\b/i, label: 'disk partitioning tool' },

  // Kill everything
  { pattern: /\bkill\s+-9\s+-1\b/, label: 'kill -9 -1 (all processes)' },

  // Recursive chown/chmod on system roots
  { pattern: /\bch(?:own|mod)\s+(?:-[a-z]*R[a-z]*\s+).*\/(?:etc|usr|bin|sbin|lib|boot)\b/, label: 'recursive chown/chmod on system dir' },
]

// ── Tier 2: Dangerous (needs approval in ask/deny mode) ─────────────

const DANGEROUS_PATTERNS = [
  // Destructive recursive chmod/chown/rm
  { pattern: /\brm\s+-[a-z]*r[a-z]*\b/, label: 'recursive rm' },
  { pattern: /\bchmod\s+(?:[-+]\s*)?777\b/, label: 'chmod 777' },
  { pattern: /\bchown\s+-R\b/, label: 'recursive chown' },

  // Pipe to shell
  { pattern: /\|\s*(?:ba)?sh\b/, label: 'pipe to shell' },
  { pattern: /\bcurl\b.+\|\s*(?:ba)?sh\b/, label: 'curl | sh' },
  { pattern: /\bwget\b.+?\|\s*(?:ba)?sh\b/, label: 'wget | sh' },

  // sudo
  { pattern: /\bsudo\b/, label: 'sudo' },
  { pattern: /\bsu\s+-/, label: 'su (switch user)' },

  // Git force push
  { pattern: /\bgit\s+push\s+.*--force/, label: 'git push --force' },
  { pattern: /\bgit\s+push\s+.*--delete/, label: 'git push --delete' },

  // Write to sensitive files via tee / redirect
  { pattern: /\btee\b.*\/(?:etc|boot|usr|bin|sbin|lib)\//, label: 'tee to system path' },
  { pattern: />\s*\/(?:etc|boot|usr|bin|sbin|lib)\//, label: 'redirect to system path' },

  // eval
  { pattern: /\beval\s+["']/, label: 'eval with quoted argument' },
  { pattern: /\beval\s*\$\{/, label: 'eval with variable expansion' },

  // Setuid/setgid
  { pattern: /\bchmod\s+[0-7]*[46][0-7]{2}/, label: 'chmod setuid/setgid' },

  // Systemd / service manipulation
  { pattern: /\bsystemctl\s+(?:enable|disable|start|stop|mask)\b/, label: 'systemctl service control' },
  { pattern: /\b(apt-get|apt|yum|dnf|brew|pip|npm)\s+install\b/, label: 'package install' },

  // Docker / container escape
  { pattern: /\bdocker\s+(?:run|exec|start)\b/, label: 'docker container control' },
]

// ── Sensitive host paths (deny write across ALL modes) ──────────────

const SENSITIVE_HOME_RELATIVES = [
  '.ssh', '.aws', '.kube', '.docker', '.gnupg', '.config/hermes',
  '.npmrc', '.gitconfig',
]

const SENSITIVE_ABSOLUTES = [
  '/etc/sudoers', '/etc/shadow', '/etc/passwd', '/etc/hosts',
  '/etc/ssl', '/root', '/boot', '/proc', '/sys', '/dev',
  // Windows-sensitive paths
  'C:\\Windows\\System32\\drivers\\etc',
]

/**
 * Check if a file path targets a sensitive host location.
 * Checks both Unix (~/, /etc) and Windows (%USERPROFILE%, C:\) paths.
 */
export function checkSensitivePath(filePath) {
  const home = process.env.USERPROFILE || process.env.HOME || '/root'
  const normalized = filePath.replace(/^~/, home).replace(/\\/g, '/')

  // Check ~-relative paths (e.g. ~/.ssh/id_rsa → /home/user/.ssh/id_rsa)
  for (const relPath of SENSITIVE_HOME_RELATIVES) {
    const pattern = `/${relPath}/`
    if (normalized.includes(pattern) || normalized.endsWith(`/${relPath}`)) {
      return { blocked: true, label: 'sensitive host path: ~/' + relPath }
    }
  }

  // Check absolute system paths
  for (const absPath of SENSITIVE_ABSOLUTES) {
    const clean = absPath.replace(/\\/g, '/')
    if (normalized.startsWith(clean)) {
      return { blocked: true, label: 'sensitive host path: ' + absPath }
    }
  }

  return { blocked: false }
}

// ── Pattern matching ────────────────────────────────────────────────

function matchPattern(cmd, patterns) {
  for (const { pattern, label } of patterns) {
    if (pattern.test(cmd)) return label
  }
  return null
}

/**
 * Check a bash command string against the hardline blocked patterns.
 * Returns { blocked: true, label, reason } if the command is blocked,
 * or { blocked: false } if it's safe (by hardline rules).
 *
 * Hardline checks are UNCONDITIONAL — even 'allow' mode can't bypass them.
 */
export function checkHardlineCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return { blocked: false }
  const label = matchPattern(cmd, HARDLINE_PATTERNS)
  if (label) {
    return { blocked: true, label, reason: `Command blocked by hardline safety rule: ${label}` }
  }
  return { blocked: false }
}

/**
 * Check a bash command string against the dangerous patterns.
 * Returns { dangerous: true, label } if the command matches a dangerous
 * pattern, or { dangerous: false } if it looks safe.
 *
 * Caller should trigger approval for dangerous commands in 'ask' mode.
 */
export function checkDangerousCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return { dangerous: false }
  const label = matchPattern(cmd, DANGEROUS_PATTERNS)
  if (label) {
    return { dangerous: true, label }
  }
  return { dangerous: false }
}

/**
 * Full safety check on a bash command. Returns { allowed, reason? }.
 *
 * - Hardline patterns ALWAYS block.
 * - Dangerous patterns trigger approval (handled by the caller via
 *   beforeToolCall → approval dialog).
 * - Permission mode deny / ask is handled separately by checkToolPermission.
 */
export function checkCommandSafety(cmd) {
  const hardline = checkHardlineCommand(cmd)
  if (hardline.blocked) {
    return { allowed: false, reason: hardline.reason }
  }
  const dangerous = checkDangerousCommand(cmd)
  if (dangerous.dangerous) {
    return { allowed: false, reason: `Dangerous command pattern: ${dangerous.label}. Explicit approval required.` }
  }
  return { allowed: true }
}
