# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LLMeter is a static, single-page dashboard for tracking usage quotas across LLM services (Claude, Codex, GitHub Copilot, Gemini). No build step, no framework, no backend — three files: `index.html`, `app.js`, `styles.css`. All data lives in the browser's `localStorage`; there is no server-side persistence or API integration (quota numbers are demo data the user edits by hand via the settings dialog).

## Commands

- `npm start` — serves the app at http://localhost:4173 via `python3 -m http.server 4173`. Just open `index.html` directly in a browser also works since there's no build step.
- `npm run check` — runs `node --check app.js` to syntax-check the JS (no test suite exists).

## Architecture

- **`index.html`** — static markup shell: topbar, hero, summary stats, quota card grid (`#quotaGrid`, populated by JS), an insight banner, and a `<dialog>`-based settings form (`#settingsDialog`) for editing quotas.
- **`app.js`** — single script, no modules/bundler. Key flow:
  - `defaultServices` is the hardcoded seed data (id, vendor, color, limit/remaining, reset period, model label) for the four services.
  - `loadServices()` merges `localStorage` (`llmeter-quotas-v1`) over `defaultServices` on load, validating/clamping numbers so corrupt storage falls back to defaults per-field.
  - `renderDashboard()` re-renders `#quotaGrid` and the summary stats (average remaining, lowest service, connected count) from the in-memory `services` array — call this any time `services` changes.
  - `renderFields()` builds the editable form in the settings dialog from `services`.
  - Saving the form (`#quotaForm` submit) validates `remaining <= limit` per service, writes the whole `services` array back to `localStorage`, then calls `renderDashboard()`.
  - Theme (light/dark) is a `body.dark` class toggle persisted under the `llmeter-theme` key, independent of the quota storage.
  - All user-supplied text (notably the free-text `model` field) is passed through `escapeHTML()` before being interpolated into template strings — preserve this when touching any render function that injects user input into `innerHTML`.
- **`styles.css`** — single unstyled-by-framework stylesheet, plain CSS custom properties (`:root` vars overridden under `body.dark`), no preprocessor.

## Conventions

- UI copy is in Japanese (`lang="ja"`); keep new user-facing strings consistent with that unless told otherwise.
- Rendering is done via template-literal `innerHTML` assignment (no virtual DOM/diffing) — the whole grid/fields list is re-rendered wholesale on every state change.
