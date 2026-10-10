# Verification record

2026-10-10: eight offline checks passed on Windows with Node.js 22.17.0. The checks include two real child processes communicating with a local HTTP fixture, checkpoint resume without redispatch, ambiguous outcome handling, cleanup failures and large fencing tokens. They do not simulate every provider failure or certify the hosted services.

The Claude Code configuration follows the vendor's documented HTTP transport and environment-variable header expansion. The VS Code configuration follows its documented editor MCP schema and private prompt inputs. JSON syntax is checked locally. Claude Code 2.1.283 reported both servers Connected using these HTTP configuration entries, environment-variable authentication and isolated user-scope configuration on 2026-10-10. No model invocation or provider action was performed. Project-scope interactive trust approval and the VS Code editor connection remain unverified; confirm tool discovery in your own client.

Hosted server discovery was checked separately during release: ONCE exposes four tools and CLAIM five. That check does not establish compatibility with every client version or provide provider credentials to ONCE actions.

The public GitHub Actions workflow runs this offline suite on Linux and Windows. Its current result is visible in the repository's Actions tab; a configured workflow alone is not a passing run.
