// Local release evidence, not a renderer or HTTP capability.
const { z } = require("zod");
const gates = Object.freeze([
  "featureParity",
  "migrationAndRollback",
  "windowsProductionUpgrade",
  "windowsNativeAndInstaller",
  "macArm64PackageAndInstall",
  "macX64PackageAndInstall",
  "physicalPhoneAndSpeech",
  "startupAndSize",
]);
const gateSchema = z
  .object({
    status: z.enum(["passed", "failed", "unverified"]),
    evidence: z.array(z.string().min(1).max(2048)).min(1),
  })
  .strict();
const releaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    productVersion: z.string().min(1),
    candidateSha256: z.string().regex(/^[a-f0-9]{64}$/),
    gates: z
      .object(Object.fromEntries(gates.map((key) => [key, gateSchema])))
      .strict(),
  })
  .strict();
function validateRelease(value) {
  const result = releaseSchema.safeParse(value);
  if (!result.success) throw Error("RELEASE_EVIDENCE_INVALID");
  return result.data;
}
module.exports = { gates, validateRelease };
