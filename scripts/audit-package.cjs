const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const asar = require("@electron/asar");

const directory = path.resolve(process.argv[2] || path.join(__dirname, "../dist/win-unpacked"));
const resources = path.join(directory, "resources");
const files = asar.listPackage(path.join(resources, "app.asar")).map((file) => file.replace(/\\/g, "/"));
const forbidden = /\/(?:\.runtime|\.snapsolver|\.test-data|\.git|tests|artifacts|scripts)(?:\/|$)|\/(?:\.env(?:\..*)?|api_keys\.json|api_base_urls\.json|devices\.json|runtime-secret\.json)$|^\/config\/.*\.local\.json$/;
assert.deepEqual(files.filter((file) => forbidden.test(file) && !file.startsWith("/node_modules/")), []);
for (const prefix of ["/node_modules/electron-builder/", "/node_modules/@playwright/", "/node_modules/playwright/", "/node_modules/app-builder-lib/"])
  assert.equal(files.some((file) => file.startsWith(prefix)), false, "Development dependency was bundled: " + prefix);
for (const file of ["/desktop/main.cjs", "/desktop/brand.cjs", "/web/brand/icon.svg", "/web/brand/icon.png", "/web/brand/trayTemplate.png", "/desktop/activity-log.cjs", "/desktop/maintenance.cjs", "/desktop/silent-audio.cjs", "/desktop/ui/index.html", "/web/extension.js", "/web/quiet.js", "/web/read-aloud.js", "/web/voice-settings.js", "/node_modules/express/package.json"])
  assert.ok(files.includes(file), "Required application resource missing: " + file);
for (const file of ["python/python.exe", "python/python312.dll", "python/LICENSE.txt", "python/Lib/site-packages/open_webui-0.12.2.dist-info/licenses/LICENSE", "runtime/launch.py", "runtime/mouse-input.py", "LICENSE.txt", "THIRD_PARTY_NOTICES.md"])
  assert.ok(fs.existsSync(path.join(resources, file)), "Required runtime or notice missing: " + file);
assert.equal(fs.existsSync(path.join(resources, "python/pyvenv.cfg")), false);
const manifest = JSON.parse(fs.readFileSync(path.join(resources, "python/runtime-manifest.json")));
assert.equal(manifest.openWebUI, "0.12.2");
assert.ok(manifest.python.startsWith("3.12."));
console.log(JSON.stringify({ files: files.length, noPrivateData: true, noDevelopmentDependencies: true, runtime: manifest }));
