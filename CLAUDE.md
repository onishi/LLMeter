# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What this is

LLMeter is a local CLI that displays real quota snapshots for Claude, Codex, and GitHub Copilot. It must never invent or fall back to demo quota values. There is no web application or Cloudflare deployment in this project.

## Commands

- `npm run cli` / `npm start` — run the human-readable CLI.
- `npm run cli -- --json` — emit the normalized JSON envelope.
- `llmeter refresh claude` — refresh five-hour and seven-day subscription quotas through the official Claude CLI `/usage` screen without sending a model prompt.
- `npm run check` — syntax-check the CLI, providers, and local helpers.
- `npm test` — run CLI, collector, and provider tests.
- `npm link` — expose the package's `llmeter` bin locally.

## CLI architecture

- `bin/llmeter.mjs` — executable entry point and top-level error boundary.
- `src/cli.mjs` — argument parsing and `--watch` execution.
- `src/collect.mjs` — invokes provider adapters and creates the versioned envelope.
- `src/providers/*.mjs` — provider-specific acquisition. Each adapter returns a service record, including a truthful unavailable/error record instead of throwing for expected missing auth or API support.
- `src/service.mjs` — shared service and percentage metric helpers.
- `src/format.mjs` — terminal rendering only; JSON output bypasses it.
- `src/state.mjs` — resolves user-local state. `LLMETER_STATE_DIR` overrides the XDG-style default.
- `src/github-auth.mjs` — creates the minimal `Plan: Read` token URL and reads/writes the dedicated token through macOS Keychain. `LLMETER_GITHUB_TOKEN` is the non-macOS override.
- `src/claude-refresh.mjs` — briefly runs the official Claude CLI in a pseudo-terminal, opens `/usage`, and waits for the configured status line cache to update without reading Claude credentials directly.
- `scripts/claude-statusline.mjs` — receives Claude Code status-line JSON on stdin and persists only rate-limit percentages/reset timestamps.

Provider order is Claude, Codex, then GitHub Copilot. Preserve that stable ordering in both text and JSON output.

## Normalized data contract

```json
{
  "version": 1,
  "updatedAt": "ISO-8601 timestamp",
  "services": [
    {
      "id": "claude",
      "status": "connected",
      "source": "Claude Code status line",
      "metrics": [
        {
          "id": "five-hour",
          "label": "5時間の利用枠",
          "usedPercent": 26,
          "remainingPercent": 74,
          "resetsAt": 1786948200
        }
      ]
    }
  ]
}
```

Allowed statuses are `connected`, `not_connected`, `unavailable`, and `error`. Do not place credentials, emails, usernames, org IDs, raw CLI output, prompts, or transcripts in this object.

## CLI behavior

- Default output is a terminal dashboard grouped by provider, with status headers, quota progress bars, reset timing, and a connection summary. It adapts bar length to terminal width. ANSI color is used only when stdout is a TTY and is disabled by `--no-color`.
- `--json` is pretty-printed for one-shot use.
- `--json --watch N` emits one compact JSON object per line (NDJSON).
- Unknown or invalid options exit with code 2. Provider availability problems remain structured service results and do not make the whole command fail.
- `--watch` collects immediately, then waits N seconds between subsequent collections.
- Claude metrics whose reset timestamp has already passed are omitted rather than displayed as current. The remaining Claude snapshot includes `observedAt`, which terminal output shows as its cache observation time.

## Security invariants

- Provider subscription credentials remain in official local CLIs.
- Never replace the user's normal `gh` OAuth token. Copilot billing uses a dedicated fine-grained token stored as `dev.llmeter.github.plan` in macOS Keychain.
- Never print the dedicated GitHub token or place it in command arguments. Pass it only as `GH_TOKEN` in the child process environment for the billing API request.
- Never log raw authentication command output.
- Keep Claude's status-line cache limited to quota percentages and reset timestamps.
- Never replace an unavailable provider with a plausible-looking number.
