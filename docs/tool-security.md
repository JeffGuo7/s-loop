# Tool Security Metadata

Every executable tool must resolve to security metadata before Snotra runs it.
Built-in tools are covered by the exact-name registry in `tool-security.mjs`. MCP
tools are always treated as external actions and default to approval.

Extensions should include a `security` property when calling `registerTool`:

```js
pi.registerTool({
  name: 'inspect_manifest',
  description: 'Read a project manifest',
  parameters: {
    type: 'object',
    properties: {
      manifestPath: { type: 'string' },
    },
    required: ['manifestPath'],
  },
  security: {
    risk: 'read',
    pathArguments: ['manifestPath'],
    approvalDefault: 'allow',
    source: 'extension',
    parallelSafe: true,
  },
  execute: async (_id, params) => {
    // ...
  },
})
```

Supported values:

- `risk`: `read`, `write-local`, `exec`, or `external`;
- `pathArguments`: argument names containing paths that must remain inside
  authorized workspace roots;
- `targetArgument`: the exact external target used in policy and audit output;
- `approvalDefault`: `allow`, `ask`, or `deny`;
- `parallelSafe`: whether calls may safely run in parallel;
- `source`: `extension` for extension tools.

Invalid or missing extension metadata does not inherit authority from the tool name.
The tool is classified as an external action and requires explicit approval, including
when the agent's global mode is `allow`.

Metadata is a policy declaration, not an OS sandbox. Extension code runs in the
sidecar process and should only be installed from trusted sources.
