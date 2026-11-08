const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { validateRelease, gates } = require("../contracts/release.cjs");
const root = path.resolve(__dirname, "..");
function evaluate(file, candidate) {
  if (!file || !fs.existsSync(file))
    return {
      status: "blocked",
      missing: [...gates],
      reason: "release evidence absent",
    };
  const report = validateRelease(JSON.parse(fs.readFileSync(file)));
  if (report.productVersion !== require("../package.json").version)
    throw Error("RELEASE_VERSION_MISMATCH");
  if (
    !candidate ||
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(candidate))
      .digest("hex") !== report.candidateSha256
  )
    throw Error("RELEASE_CANDIDATE_MISMATCH");
  const missing = gates.filter((key) => report.gates[key].status !== "passed");
  for (const key of gates)
    for (const evidence of report.gates[key].evidence) {
      const full = path.resolve(root, evidence),
        relative = path.relative(root, full);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        !fs.existsSync(full) ||
        !fs.statSync(full).isFile()
      )
        throw Error("RELEASE_EVIDENCE_MISSING");
    }
  return { status: missing.length ? "blocked" : "passed", missing };
}
if (require.main === module) {
  try {
    const result = evaluate(process.argv[2], process.argv[3]);
    console.log(JSON.stringify(result));
    if (result.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { evaluate };
