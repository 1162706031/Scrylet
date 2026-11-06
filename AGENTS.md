# Repository Guidelines

## Project structure

Scrylet (formerly Snap-Solver 2) is an Electron desktop companion and a LAN phone web experience. `desktop/main.cjs` owns lifecycle and narrow IPC, `native.cjs` owns screen capture, `pairing.cjs` owns device credentials, and `gateway.cjs` authenticates and proxies phone traffic. The unmodified Open WebUI 0.12.2 wheel runs on loopback through `runtime/launch.py`.

`desktop/ui/` contains the connection window. `web/` contains pairing, provider setup, and an additive screenshot attachment extension for the upstream chat UI. Model catalog and prompt seeds live in `config/`. Do not rebuild a parallel chat state machine or provider SDK layer.

## Commands

- `npm ci && npm run setup`: install Node dependencies and isolated Python 3.12 runtime.
- `npm start`: open the real desktop App.
- `npm run check`: syntax and catalog validation.
- `npm test`: offline pairing / gateway tests.
- `npx playwright install chromium webkit && npm run test:ui`: actual upstream UI against a local mock provider.
- `npm run test:desktop`: isolated Electron launch, native capture, close-to-tray check.
- `npm run test:desktop-input`: Windows system hotkeys, long-press region capture and auto-submit against a local mock provider.
- `npm run test:maintenance`: isolated operation-log, cache cleanup and data-preservation acceptance.
- `npm run test:network`: native desktop network selection, restart persistence and pairing at the LAN origin.
- `npm run dist:win`: prepare the bundled Python runtime and build the Windows x64 NSIS installer on native Windows.

## Implementation

Use small CommonJS modules and plain browser modules. Phone screenshot buttons append images to the current upstream composer without submitting or replacing previous attachments. Explicit desktop capture-and-send actions may append a screenshot and the configured default prompt, then submit through the upstream composer. Use one authenticated receiver page, reject existing drafts or active generation, and never replay an uncertain submission. Screenshot feedback is opt-in and defaults off: silent capture must not display overlays, notifications or capture hints, or automatically show the desktop window. Region selection is optional. Keep primary screens visual and concise; reveal configuration details only when requested.

Keep Open WebUI fixed at one explicitly tested version. `runtime/requirements-slim.txt` is the upstream dependency source; `runtime/requirements.lock` pins transitive packages with platform markers. Regenerate it deliberately after a dependency upgrade and rerun the browser integration checks.

## Verification

External model requests must remain mocked by default. Distinguish unit checks, browser integration, actual native screenshot capture, physical-phone testing and Windows device testing. Native screen permission may need a user action; do not report a denied capture as success. Keep failed checks visible and avoid asserting untested provider accounts work.

## Configuration

Never commit real keys, runtime databases, pairing tokens or local settings. `.runtime/`, `.test-data/`, `.snapsolver/`, `config/*.local.json` and test traces are ignored. Read old local configuration for migration without modifying it. New runtime data belongs in Electron userData. Do not dump environment variables, provider config responses or raw request bodies containing secrets.

## Commits

Use concise Chinese imperative subjects. Never add `Co-Authored-By: Codex`. When pushing to ByteDance infrastructure use `zylanjian <zihanjian@bytedance.com>`. Describe user-visible behavior, relevant validation and remaining acceptance limits; include actual rendered screenshots for UI changes.
