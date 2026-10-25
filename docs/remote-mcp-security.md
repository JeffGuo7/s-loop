# Remote MCP security and authorization

S-Loop supports MCP servers through the MCP client that ships inside the pi SDK
(`@earendil-works/pi-mcp`): Streamable HTTP for remote servers, stdio for local
ones. Remote tools remain `external` and require approval by default.

## Configuration layers

Public configuration contains the server name, URL or command/args, transport
preference, OAuth client ID/scopes, and tool filters. It may be persisted in the
WebView store.

Secret configuration contains HTTP headers and stdio environment values. On
Windows it is encrypted with DPAPI for the current user and stored under the
S-Loop application-data directory. Secret values are resolved only when a
connection starts.

OAuth tokens (access/refresh, client registration, discovery state) are owned by
the sidecar's token store at `<data-dir>/.s-loop/mcp-auth.json`, keyed by server
name and URL.

Legacy configurations containing `headers` or `env` are migrated on hydration and
the next persisted snapshot is redacted.

## Remote authorization

- Static bearer/API-key servers continue to work through protected header values.
- OAuth servers run pi's flow: RFC 9728 protected-resource discovery, OAuth/OIDC
  authorization-server discovery, PKCE S256, resource indicators, dynamic client
  registration where available, and token refresh.
- Sign-in is explicit: a connection that hits a 401 parks the server in
  `auth-required`; the desktop app then starts the flow
  (`POST /mcp-sse/oauth-start`), opens the authorization URL, and the sidecar
  exchanges the code on a loopback callback server it owns for the duration of
  the flow.
- The loopback callback is tokenless only at its exact callback path. A random,
  one-time OAuth `state` is still required and verified before code exchange.

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
