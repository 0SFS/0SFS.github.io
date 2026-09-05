# Agent Instructions

## Development Servers

- Never start a development, preview, watch, or other long-running server unless the user explicitly asks the agent to start it.
- When browser verification requires a server, give the user the exact command and ask them to start it.
- Do not assume permission from an already running server or from a request to test browser behavior.
- If the agent started a server after an explicit request, report its URL and stop it as soon as the requested verification is complete.