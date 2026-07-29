# Remote MCP security and authorization

Snotra supports remote MCP servers through modern Streamable HTTP with legacy
HTTP+SSE fallback. Remote tools remain `external` and require approval by default.

## Configuration layers

Public configuration contains the server name, URL, transport preference, OAuth
client ID/scopes, and tool filters. It may be persisted in the WebView store.

Secret configuration contains HTTP headers, stdio environment values, OAuth client
secrets, access/refresh tokens, client registration data, and discovery state. On
Windows it is encrypted with DPAPI for the current user and stored under the Snotra
application-data directory. Secret values are resolved only when a connection starts.

Legacy configurations containing `headers` or `env` are migrated on hydration and
the next persisted snapshot is redacted.

## Remote authorization

- Static bearer/API-key servers continue to work through protected header values.
- OAuth servers use the MCP SDK's RFC 9728 protected-resource discovery, OAuth/OIDC
  authorization-server discovery, PKCE S256, resource indicators, dynamic
  registration where available, token refresh, and scope challenges.
- The loopback callback is tokenless only at its exact callback path. A random,
  one-time OAuth `state` is still required and verified before code exchange.
- OAuth tokens are exported over the authenticated sidecar channel and moved into
  the OS-protected credential vault.

## Tool filters

Each server may define:

```json
{
  "toolFilter": {
    "allow": ["company_*", "risk_search"],
    "deny": ["*_delete"]
  }
}
```

Patterns support `*` and `?`. Deny rules take precedence. Filtering controls which
tools are exposed to the model; it does not lower the remaining tools' MCP risk.

The `2025-11-25` protocol remains the production compatibility baseline. The
`2026-07-28` release candidate is intentionally not forced because it removes the
legacy initialization/session lifecycle and SDK adoption is still mixed.
