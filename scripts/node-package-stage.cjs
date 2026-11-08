// A separate app manifest prevents builder's deep metadata merge retaining
// comparison-only dependencies. Nothing in the repository is rewritten.
const fs = require("node:fs"),
  path = require("node:path");
function stageNodePackage(root, parent) {
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "app-"));
  for (const name of ["desktop", "service", "contracts", "web"])
    fs.cpSync(path.join(root, name), path.join(directory, name), {
      recursive: true,
      filter: (file) =>
        !/\.pyc?$/.test(file) && !/legacy-[^\\/]+\.cjs$/.test(file),
    });
  for (const name of [
    "config/providers.json",
    "config/prompts.json",
    "config/product-scope.json",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  }
  fs.cpSync(
    path.join(root, "build/phone"),
    path.join(directory, "phone-dist"),
    { recursive: true },
  );
  const original = require(path.join(root, "package.json")),
    metadata = {
      ...original,
      dependencies: { ...original.dependencies },
      devDependencies: {},
      scripts: {},
    };
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify(metadata, null, 2),
  );
  const seen = new Set();
  function collect(name, from) {
    let entry;
    try {
      entry = require.resolve(name + "/package.json", { paths: [from] });
    } catch {
      entry = require.resolve(name, { paths: [from] });
    }
    let folder = path.dirname(entry),
      manifest;
    for (;;) {
      const file = path.join(folder, "package.json");
      if (fs.existsSync(file)) {
        const current = JSON.parse(fs.readFileSync(file));
        if (current.name === name) {
          manifest = current;
          break;
        }
      }
      const next = path.dirname(folder);
      if (next === folder) throw Error("NODE_PACKAGE_DEPENDENCY_MISSING");
      folder = next;
    }
    if (seen.has(folder)) return;
    seen.add(folder);
    const relative = path.relative(root, folder);
    if (!relative.startsWith("node_modules" + path.sep))
      throw Error("NODE_PACKAGE_DEPENDENCY_OUTSIDE_ROOT");
    fs.cpSync(folder, path.join(directory, relative), {
      recursive: true,
      filter: (file) =>
        !path.relative(folder, file).split(path.sep).includes("node_modules"),
    });
    for (const dependency of Object.keys(manifest.dependencies || {}))
      collect(dependency, folder);
  }
  for (const name of Object.keys(metadata.dependencies)) collect(name, root);
  return directory;
}
module.exports = { stageNodePackage };
