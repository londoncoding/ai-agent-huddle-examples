# MCP client setup

## Claude Code

Copy `claude-code.json` to `.mcp.json` in your own project (merge entries if one already exists). Set ONCE_API_KEY and CLAIM_API_KEY in the terminal environment before starting Claude Code. A Node `.env` file is not automatically loaded by Claude Code. Do not paste keys into a committed JSON file.

Run `claude mcp list`. Project servers may be pending approval: review and approve these specific URLs in Claude Code's `/mcp` screen. Once connected, expect four ONCE tools and five CLAIM tools. Request tool discovery before any action. Configuration uses the vendor's documented HTTP transport and environment-variable expansion in headers.

Source: https://code.claude.com/docs/en/mcp

## VS Code Chat / editor MCP configuration

Copy `vscode-mcp.json` to `.vscode/mcp.json` in your own workspace, merging with existing servers. The editor prompts privately for each product key. Use `MCP: List Servers` to start each server; review any trust prompt and confirm the expected tools. This configuration targets the editor's MCP flow. Copilot CLI and Agent Host configurations use a different format; interactive `${input:...}` prompts are not portable to those flows.

Source: https://code.visualstudio.com/docs/agents/reference/mcp-configuration

## Scope and verification

These connections authenticate to the hosted servers. ONCE's provider-backed actions additionally need the dedicated GitHub/Stripe HTTP headers documented in its API reference. The default configurations deliberately contain only product authentication; they do not give the client a GitHub token or a Stripe secret.

A 401 means authentication failed; seeing a listed URL alone is not a working connection. The same configuration file can be valid while a client cannot connect. Verification results and their limits are recorded in `verification.md`.

Do not ask the model to run arbitrary create/retry tools just to test discovery. Clients supporting only OAuth cannot use these API-key configurations.
