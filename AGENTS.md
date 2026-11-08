# Repository Guidelines

## Project structure

Scrylet (formerly Snap-Solver 2) is an Electron desktop companion and a LAN phone web experience. `desktop/main.cjs` owns lifecycle and narrow IPC, `native.cjs` owns screen capture, `pairing.cjs` owns device credentials, and `gateway.cjs` authenticates phone traffic. The Node service refactor is authorized; follow `docs/node-service-refactor.md`, `docs/node-service-implementation.md` and the evidence in `docs/node-service-baseline.md`. Source `npm start` now defaults to the Node implementation. Existing legacy data is imported read-only from `Snap-Solver` into the separate `Scrylet` data directory, preserving the original for rollback. The user authorized final dependency retirement on 2026-11-09, accepted the previously tested M0 retention matrix, deferred Mac device testing and requested minimal repeated tests. The only runtime is now Node. Historical comparison source, original assertions, fixed dependency declarations and notices are preserved in docs/archive/legacy-comparison-source.tar.gz; do not restore them as live dependencies. Untested platform acceptance stays unverified.

`desktop/ui/` contains the connection window. `web/` contains pairing, provider setup, public assets and shared speech modules. `service/**/*.cjs` modules own the isolated Node implementation of persistence, branches, generation and AI SDK adapters; new `phone/` code uses strict TypeScript + React and one composer / SDK chat state. Keep existing desktop, scripts and tests in JS / CommonJS, the root module type and Electron version unchanged. Windows input observation and system-input acceptance now use separate precompiled Rust programs under `native/`; the observer cannot inject input and the test driver must never enter app resources. Python / Open WebUI preparation and input scripts have been retired; the native path must never call them. Model catalog and prompt seeds remain in `config/`. Do not create a second composer or a parallel provider SDK.

## Commands

- `npm ci && npm run setup`: prepare the Node service / strict phone build and verify the precompiled Windows observer, without Python.
- `npm run start:node -- --data <absolute isolated directory>`: source Node app; `npm start` uses the same sole Node implementation with normal userData.
- `npm start`: open the real desktop App.
- `npm run check`: syntax and catalog validation.
- `npm test`: offline pairing / gateway tests.
- `npx playwright install chromium webkit && npm run test:ui`: actual Node phone UI against local mock providers. Original upstream comparison assertions are preserved in the source archive.
- `npm run test:startup`: real Node Electron startup, saved text/image drafts and history, one loopback mock per sample, complete child/port exit, process memory; defaults to ten restarts. `--executable` tests a real default-Node candidate without a runtime override. `--post-reboot --directory <prepared test dir>` records one actual boot sample and never reboots. The historical startup baseline remains in the source archive and existing evidence.
- `npm run typecheck:phone && npm run build:phone`: strict TS / React static build. Builds the Node phone UI and a separate compatibility probe; Node is the only runtime.
- `npm run test:compat`: actual utilityProcess / SQLite / ESM SDK probes in source and an independent ASAR, plus Chromium / WebKit transport checks and parent-only termination. See `docs/node-service-compatibility.md`; untested platforms remain unverified.
- `npm run test:formats`: frozen actual legacy storage / saved browser drafts and both SDK protocols; no Python or live legacy runtime. See `docs/node-service-formats.md`.
- `npm run test:contracts`: shared boundary validators, declarations and recovery contracts. M1 service / gateway boundaries are wired; the runtime is Node.
- `npm run test:service -- --asar`: real Electron utilityProcess, SQLite, OS-backed secrets, SDK mock, generation and gateway acceptance in source and an independent test ASAR. This does not verify final installers or macOS. See `docs/node-service-m1.md`.
- `npm run test:phone`: isolated real Node service with mocked providers in Chromium / WebKit; includes drafts, capture/crop, branches/menus, desktop receiver, speech controls and layouts.
- `npm run test:phone:asar`: phone integration against an independent test ASAR outside the repository, including compiled assets and browser licenses; not final package acceptance.
- `npm run test:migration`: isolated frozen legacy-format reconstruction, source immutability, six process-crash checkpoints / OS-secret recovery and independent rollback export. Actual old-app readback is historical evidence and original assertions remain archived. See `docs/node-service-m4.md`.
- `npm run test:default-migration`: actual source `npm start` semantics without an engine override, using explicitly honored redirected APPDATA and a frozen synthetic legacy snapshot; verifies automatic migration, original bytes and non-repeating restart, never the real user database.
- `npm run export:legacy -- --data <isolated new data> --output <new independent old copy> [--executable <installed new app>]`: local stopped-writer export through the app encryption identity; preserves a readable Node snapshot, never overwrites either original.
- `npm run prepare:upgrade:win -- --old-installer <file> --new-unpacked <dir> --output <new .test-data dir>`: builds unchanged payloads with an acceptance-only NSIS namespace. `npm run test:upgrade:win -- --isolated-nsis --old-installer <file> --new-installer <file>` performs actual installation / replacement / reinstall / old readback, preserving existing product registrations / shortcuts / updater cache. Production GUID upgrade remains unverified.
- `npm run test:desktop`: isolated Electron launch, native capture, close-to-tray check.
- `npm run build:native`: Windows x64 developer build with pinned Rust 1.91.0 GNU and Cargo.lock; writes observer/test driver separately to ignored `build/native/`. End users never compile or download a helper.
- `npm run test:native`: Windows system events, five mouse buttons, parent death and forced test-driver cleanup. Refuses injection while an existing Electron/Scrylet app is running.
- `npm run test:desktop-input`: Windows system hotkeys, all long-press buttons and silent auto-submit in an isolated Node app against a local mock provider; no Python fixture/driver. `SNAP_TEST_EXECUTABLE` selects an unpacked copy.
- `npm run test:desktop-lifecycle`: Windows source/unpacked close-to-tray, menu reopen, normal exit, main-only crash and child cleanup in isolated Node data.
- `npm run test:maintenance`: isolated operation-log, cache cleanup and data-preservation acceptance.
- `npm run test:network`: native desktop network selection, restart persistence and pairing at the LAN origin.
- `npm run dist:win`: build a staged Node-only Windows x64 NSIS using the production app identity, audit resources/licenses, and copy it plus SHA-256 to `dist/releases/<version>/`. Does not install or publish. `dist:win:candidate` retains the independent NSIS acceptance namespace.
- `npm run test:candidate:win [-- --native-only]`: isolated current candidate suite, with native input, source/unpacked lifecycle, actual capture, cache preservation and LAN pairing; preserves older artifact bytes.
- `npm run measure:package`: actual full Windows candidate bytes/hashes, never Mac extrapolation. `test:release` validates version/hash-bound local release evidence; missing hardware gates fail closed.
- `npm run icons:mac`: rasterize the existing SVG at 16–1024px / Retina; actual macOS uses iconutil for ICNS.
- `npm run dist:mac:arm64` / `npm run dist:mac:x64`: on macOS, build each architecture's development DMG/ZIP and audit resources/signing; default host arch via `dist:mac`. Linux may explicitly build `--archive-only --prebuilt-phone` ZIPs with a native Linux builder. Cross-build resource audits do not verify target OS execution. Mac tests are deferred by user request; DMG/signing require macOS.
- `npm run test:mac-package -- --arch arm64 --dmg <file> --zip <file> [--previous-app <app>] [--legacy-source <synthetic .test-data>]`: target Mac hardware, isolated installation replacement/reinstall, actual capture and Keychain checks. Never substitutes Windows/Rosetta results for target-architecture acceptance. See `docs/node-service-m3.md` for remaining manual gates.

## Implementation

Use small CommonJS service modules and existing plain browser modules; new phone code follows its strict TS boundary. Phone screenshot buttons append images to the single current composer without submitting or replacing previous attachments. Explicit desktop capture-and-send actions may append a screenshot and the configured default prompt, then submit through that same composer. Use one authenticated receiver page, reject existing drafts or active generation, and never replay an uncertain submission. Screenshot capture is always silent: no sound, overlays, notifications, capture hints, window restore or focus; `showCaptureHints` always returns false even for old true values. Region selection is optional. Preserve the separate opt-in phone read-aloud and voice settings. Keep primary screens visual and concise; reveal configuration details only when requested.

Keep the frozen legacy schema and data importer/exporter. Historical comparison dependencies and assertions remain in the source archive, excluded from packages. User data and old installers are preserved for rollback; comparisons use independent writable data. Preserve F01–F36 and all reachable operations discovered in M0, saved drafts, message branches, images, deleted-key state, pairing and network preferences. Pause disconnects phone access; only explicit stop cancels generation. New HTTP / storage / process boundaries need contract tests. Windows NSIS and separate macOS arm64 / x64 DMG + ZIP require actual package and installation evidence; untested platforms remain unverified.

## Verification

External model requests must remain mocked by default. Distinguish unit checks, browser integration, actual native screenshot capture, physical-phone testing and Windows device testing. Native screen permission may need a user action; do not report a denied capture as success. Keep failed checks visible and avoid asserting untested provider accounts work.

## Configuration

Never commit real keys, runtime databases, pairing tokens or local settings. `.runtime/`, `.test-data/`, `.snapsolver/`, `config/*.local.json` and test traces are ignored. Read old local configuration for migration without modifying it. New runtime data belongs in Electron userData. Do not dump environment variables, provider config responses or raw request bodies containing secrets.

## Commits

Use concise Chinese imperative subjects. Never add `Co-Authored-By: Codex`. When pushing to ByteDance infrastructure use `zylanjian <zihanjian@bytedance.com>`. Describe user-visible behavior, relevant validation and remaining acceptance limits; include actual rendered screenshots for UI changes.
