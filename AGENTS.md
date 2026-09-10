# Agent Instructions

## Testing and computer use

- Prefer terminal commands, scripts, APIs, and headless browser automation for tests and benchmarks, including CPU/GPU comparisons.
- Do not take over the user's cursor or use a visible Chrome/browser GUI when a terminal or headless route can perform the task.
- Use GUI automation only when it is the only viable way to verify the required behavior; explain that necessity before using it.
- For GPU benchmarks, verify that the terminal/headless runtime uses the real hardware GPU rather than a software fallback.

## Development Servers

- Never start a development, preview, watch, or other long-running server unless the user explicitly asks the agent to start it.
- When browser verification requires a server, give the user the exact command and ask them to start it.
- Do not assume permission from an already running server or from a request to test browser behavior.
- If the agent started a server after an explicit request, report its URL and stop it as soon as the requested verification is complete.
