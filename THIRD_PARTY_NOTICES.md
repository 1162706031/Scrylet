# Third-party components

Scrylet (formerly Snap-Solver) is an independent application. Current packages use an Electron-hosted Node service and a React phone interface. They do not contain Python, Open WebUI or http-proxy. The read-only legacy database importer and local rollback exporter are original compatibility code.

- **Electron 44.8.0** — MIT and bundled Chromium notices. Electron's license files accompany the application.
- **Vercel AI SDK 7.0.164**, **@ai-sdk/openai 4.0.110**, **@ai-sdk/openai-compatible 3.0.86**, **@ai-sdk/react 4.0.168** — Apache-2.0. Their dependencies retain their licenses, including json-schema (AFL-2.1 OR BSD-3-Clause), undici, eventsource-parser and standard-schema (MIT), and Vercel workflow/OIDC components (Apache-2.0).
- **Express**, **node-qrcode**, **Zod 4.6.7** — MIT. Production Node packages retain their installed license files inside the application archive.
- **React / React DOM 19.3.1**, **Cropper.js 1.6.2** — MIT. Compiled into the phone interface.
- **react-markdown 10.1.0**, **remark-gfm 4.0.1**, **remark-math 6.0.0**, **rehype-katex 7.0.1**, **KaTeX 0.16.47** — MIT, including bundled KaTeX fonts.
- **pdf-lib 1.17.1**, **html2canvas 1.4.1** — MIT; loaded on demand for local PDF export.
- **Rust 1.91.0 standard library / Windows GNU runtime** — the precompiled Windows x64 and macOS arm64 / x64 input observers are original Scrylet code under Apache-2.0, built from the same crate. Rust is MIT OR Apache-2.0 with component notices. The exact toolchain's `COPYRIGHT.html` and `COPYRIGHT-library.html` are copied beside each packaged observer under `resources/native/<platform>-<arch>/licenses/`, with `NOTICE.txt`. The Windows observer uses system DLLs; the Mac observer uses a passive Quartz event tap. The separate Windows test input driver is excluded from packages.

Complete compiled browser dependency notices are generated into `phone-dist/licenses.md`. All installations include this notice, the repository license, production Node dependency licenses and Electron notices. macOS packages exclude Windows native helpers and include their own Rust observer. No end-user Node, Python, Rust or development tools are required.

Development-only tools include **Playwright** and **TypeScript 6.0.3** (Apache-2.0), **Vite 8.3.6** and **electron-builder** (MIT). They are excluded from installed packages. Exact Node dependency versions remain recorded in `package-lock.json`.

Historical comparison source, original tests and notices are preserved in `docs/archive/legacy-comparison-source.tar.gz`; that source archive is excluded from application packages. Historical Open WebUI 0.12.2 and CPython 3.12 packages retain their original licenses and branding, including the [Open WebUI 0.12.2 license](https://github.com/open-webui/open-webui/blob/v0.12.2/LICENSE). Their notices in the archived source and previously built comparison installers remain intact. The repository's Apache-2.0 license does not relicense third-party components.
