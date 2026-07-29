# Execution Audit Trail

Snotra writes security-sensitive execution events to:

`{application-data}/audit/events.jsonl`

The log is append-only. Every event contains the previous event hash and its own
SHA-256 hash, creating a verifiable chain. Startup fails before announcing sidecar
readiness if the existing chain is malformed or has been modified.

The first covered lifecycle is durable approval:

- approval requested;
- approved, denied, or revoked;
- approved tool execution started;
- execution completed, failed, or was interrupted by restart.

Events carry surface, run, approval, tool-call, and canonical tool fingerprint IDs.
Tool arguments are retained only in their recursively redacted form. Authorization,
token, secret, password, API-key, and cookie fields are never written verbatim.

Local API:

- `GET /audit/events?limit=200&surface=task&runId=...`
- `GET /audit/verify`

Both endpoints are protected by the per-launch sidecar token and Origin policy.
Hash chaining detects modification; it does not prevent a local administrator or
malware with filesystem access from deleting the entire log. OS-backed signing or
remote archival can be added later when that stronger threat model is required.
