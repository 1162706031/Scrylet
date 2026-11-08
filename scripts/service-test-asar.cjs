const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");
// Test archive only. It includes synthetic acceptance fixtures, never userData.
async function serviceTestArchive(root, directory, { main = "tests/service/main.cjs" } = {}) {
  const staging = path.join(directory, "staging"); fs.mkdirSync(staging, { recursive: true });
  for (const folder of ["desktop", "service", "contracts", "web", "tests/service", "tests/phone"]) fs.cpSync(path.join(root, folder), path.join(staging, folder), { recursive: true, filter: file => !/\.pyc?$/.test(file) && !file.split(path.sep).includes("__pycache__") });
  if (fs.existsSync(path.join(root, "build/phone/index.html"))) fs.cpSync(path.join(root, "build/phone"), path.join(staging, "phone-dist"), { recursive: true });
  for (const file of ["config/providers.json", "config/prompts.json", "config/product-scope.json", "tests/fixtures/protocol-provider.cjs", "tests/fixtures/legacy-v1/database.json", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    fs.mkdirSync(path.dirname(path.join(staging, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(staging, file));
  }
  function resolvePackage(name, from) {
    let entry; try { entry = require.resolve(name + "/package.json", { paths: [from] }); }
    catch { entry = require.resolve(name, { paths: [from] }); }
    for (let folder = path.dirname(entry); folder !== path.dirname(folder); folder = path.dirname(folder)) {
      const file = path.join(folder, "package.json"); if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).name === name) return folder;
    }
    throw Error("SERVICE_PACKAGE_UNRESOLVED");
  }
  const packages = new Map();
  function collect(name, from) {
    const folder = resolvePackage(name, from); if (packages.has(folder)) return;
    const relative = path.relative(root, folder); if (!relative.startsWith("node_modules" + path.sep)) throw Error("SERVICE_PACKAGE_OUTSIDE_ROOT");
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, "package.json"), "utf8"));
    packages.set(folder, { name, version: manifest.version, license: manifest.license });
    fs.cpSync(folder, path.join(staging, relative), { recursive: true, filter: file => !path.relative(folder, file).split(path.sep).includes("node_modules") });
    for (const dependency of Object.keys(manifest.dependencies || {})) collect(dependency, folder);
  }
  const manifest = require(path.join(root, "package.json"));
  for (const name of Object.keys(manifest.dependencies)) collect(name, root);
  fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify({ name: "scrylet-service-test", version: manifest.version, main, dependencies: manifest.dependencies }));
  const target = path.join(directory, "归档 资源.实验", "app.asar"); fs.mkdirSync(path.dirname(target), { recursive: true });
  await asar.createPackage(staging, target);
  const entries = asar.listPackage(target).map(f => f.replace(/\\/g, "/"));
  if (fs.existsSync(path.join(staging, "phone-dist"))) {
    for (const name of ["/phone-dist/index.html", "/phone-dist/compatibility.html", "/phone-dist/licenses.md"]) if (!entries.includes(name)) throw Error("PHONE_ARCHIVE_RESOURCE_MISSING");
    const license = asar.extractFile(target, path.join("phone-dist", "licenses.md")).toString();
    for (const name of ["react", "react-markdown", "katex", "cropperjs", "pdf-lib", "html2canvas"]) if (!license.toLowerCase().includes(name)) throw Error("PHONE_ARCHIVE_LICENSE_MISSING");
  }
  const projectFiles = entries.filter(file => /^\/(desktop|service|contracts|web|config|phone-dist)\//.test(file) && !fs.statSync(path.join(staging, file.slice(1))).isDirectory());
  for (const file of projectFiles) if (!asar.extractFile(target, file.slice(1).replace(/\//g, path.sep)).equals(fs.readFileSync(path.join(staging, file.slice(1))))) throw Error("SERVICE_ARCHIVE_BYTE_MISMATCH");
  for (const required of ["/service/main.cjs", "/service/migrations/schema/001.sql", "/service/migrations/schema/002.sql", "/contracts/validate.cjs", "/contracts/http-v1.json", "/node_modules/ai/dist/index.js", "/node_modules/express/index.js", "/LICENSE", "/THIRD_PARTY_NOTICES.md"]) if (!entries.includes(required)) throw Error("SERVICE_ARCHIVE_RESOURCE_MISSING");
  if (entries.some(f => /\/(?:\.runtime|\.test-data|\.snapsolver|python|runtime)\//.test(f) || f.endsWith(".py") || f.includes(".local.json"))) throw Error("SERVICE_ARCHIVE_PRIVATE_RESOURCE");
  return { file: target, entries: entries.length, matchedProjectFiles: projectFiles.length, productionPackages: [...packages.values()], bytes: fs.statSync(target).size,
    sha256: require("node:crypto").createHash("sha256").update(fs.readFileSync(target)).digest("hex") };
}
module.exports = { serviceTestArchive };
