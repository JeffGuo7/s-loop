# Durable Unattended Approvals

Scheduled tasks and Goal Loop runs use durable approvals. When either unattended
surface reaches an `approval-required` policy decision, Snotra:

1. persists a redacted approval request under the application data directory;
2. marks the task or goal as `waiting_for_approval`;
3. leaves the tool call unexecuted;
4. exposes the request through the Approvals inbox and local sidecar API;
5. resumes the parked call after approval, or fails the run after denial.

Pending requests survive an application restart. A post-restart approval reconstructs
the task or goal run and can authorize only the same tool name and canonical argument fingerprint.
The grant is consumed once. Safe read work may be repeated while reconstructing the
run, but the approved side effect is not executed before the match succeeds.

Approval arguments are recursively redacted for token, authorization, secret,
password, API-key, and cookie fields before persistence. The unredacted arguments are
used only to calculate a SHA-256 call fingerprint.

If the process exits after an approval has begun resuming, the record becomes
`interrupted` on startup and is not replayed automatically. This deliberately avoids
duplicating a side effect whose completion is unknown. Phase 5's durable execution
audit will provide the stronger completion/idempotency checkpoint needed to recover
that final ambiguity.

Goal runs continue in the background if their SSE viewer disconnects. Waiting for a
decision does not consume the Goal Loop's five-minute execution budget. Explicitly
stopping a goal still aborts its controller and leaves the unexecuted approval inert.

Local API:

- `GET /approvals?status=pending&status=approved`
- `POST /approvals/:id/decision` with `{ "decision": "approve" }`
- `POST /approvals/:id/decision` with `{ "decision": "deny" }`

These endpoints are protected by the same per-launch sidecar token and Origin policy
as the rest of the local API.
