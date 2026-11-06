# Third-party components

Scrylet (formerly Snap-Solver) is an independent integration. It is not an official Open WebUI product and is not endorsed by its maintainers.

- **Open WebUI 0.12.2** — the official, unmodified wheel is downloaded during setup and included in the Windows client. Its UI, runtime and branding remain present. See the [tagged source license](https://github.com/open-webui/open-webui/blob/v0.12.2/LICENSE), [license explanation](https://docs.openwebui.com/license/), and [official slim requirements](https://github.com/open-webui/open-webui/blob/v0.12.2/backend/requirements-slim.txt). Open WebUI and its dependencies retain their own licenses; the repository's Apache-2.0 license does not relicense them.
- **CPython 3.12** — the Windows client includes the relocatable Python distribution prepared by python-build-standalone/uv. Its `LICENSE.txt` is retained in `resources/python/`, together with the installed dependencies and their original distribution notices.
- **Electron 44.8.0** — [MIT and bundled Chromium notices](https://github.com/electron/electron/blob/v44.8.0/LICENSE).
- **Cropper.js 1.6.2** — [MIT](https://github.com/fengyuanchen/cropperjs/blob/v1.6.2/LICENSE).
- **Express**, **http-proxy**, **node-qrcode** — their installed packages include MIT license notices.
- **Playwright** — [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE), development verification only.

Runtime dependency versions are recorded in `runtime/requirements.lock` and Node dependency versions in `package-lock.json`. The Windows installation includes this notice and the repository license under `resources/`, Python package license files under `resources/python/Lib/site-packages/`, Node package licenses in the application archive, and Electron's bundled Chromium notices in the installation directory. Development-only tools such as Playwright and electron-builder are not part of the installed application.
