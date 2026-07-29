# Execution Audit Trail

Snotra writes security-sensitive execution events to:

`{application-data}/audit/events.jsonl`

The log is append-only. Every event contains the previous event hash and its own
SHA-256 hash, creating a verifiable chain. Startup fails before announcing sidecar
readiness if the existing chain is malformed or has been modified.

Covered lifecycles:

- approval requested;
- approved, denied, or revoked;
- approved tool execution started;
- execution completed, failed, or was interrupted by restart.
- session, task, Goal, and platform runs started/resumed/completed/failed;
- every tool policy decision and actual tool execution start/completion/failure;
- delegated sub-agent tool calls, correlated to the parent surface and run.

Events carry surface, run, approval, tool-call, and canonical tool fingerprint IDs.
Tool arguments are retained only in their recursively redacted form. Authorization,
token, secret, password, API-key, and cookie fields are never written verbatim.
Tool result bodies and model response text are deliberately excluded from the audit
trail; existing output/session stores remain the place for user-visible content.

Local API:

- `GET /audit/events?limit=200&surface=task&runId=...`
- `GET /audit/verify`

Both endpoints are protected by the per-launch sidecar token and Origin policy.
Hash chaining detects modification; it does not prevent a local administrator or
malware with filesystem access from deleting the entire log. OS-backed signing or
remote archival can be added later when that stronger threat model is required.

## Restart recovery

At startup, persisted task, Goal, or platform runs still marked `running` or
`resuming` are treated as uncertain executions. Snotra marks them failed/interrupted,
emits `run.interrupted`, and never replays them automatically. Runs parked at
`waiting_for_approval` remain resumable because their side-effecting tool call has
not started. Approval records already in `resuming` follow the same conservative
interrupted rule.
