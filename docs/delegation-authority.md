# Delegation authority

Every sub-agent receives a derived authority envelope. The envelope is the
intersection of:

- tools present in the parent capability index;
- tools explicitly requested by the child definition;
- the stricter parent/child permission mode and rules;
- the parent's existing workspace roots;
- parent turn and delegation-depth budgets.

An empty child tool list means no tools. It no longer means all tools. Delegation
tools are removed from every child profile, and delegation depth is capped even if a
future tool source attempts to reintroduce one.

## Explorer

`explorer` is a built-in fixed profile with only `read`, `grep`, `find`, and `ls`.
The runtime ignores attempts to add shell, write, web, MCP, or delegation tools to
that profile. Because no network tool is retained, web-search credentials are also
removed from its runtime configuration.

## Audit

Sub-agent audit events include the parent actor and effective delegation depth.
Every retained child tool still passes through the shared policy, workspace-root,
approval, and audit pipeline before execution.
