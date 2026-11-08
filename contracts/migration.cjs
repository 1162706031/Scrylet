// Local migration/storage boundary only. Never expose credentials or row data.
const { z } = require("zod");
const { ContractError } = require("./validate.cjs");
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  count = z.number().int().nonnegative().safe();
const counts = z
  .object({
    chats: count,
    messages: count,
    files: count,
    prompts: count,
    connections: count,
    conflicts: count,
  })
  .strict();
const stages = z.enum([
  "inspected",
  "snapshotted",
  "files",
  "data",
  "validated",
  "activated",
]);
const schemas = {
  state: z
    .object({
      schemaVersion: z.literal(1),
      runId: hash,
      sourceIdentity: hash,
      stage: stages,
      snapshotHash: hash.nullable(),
      counts: counts.nullable(),
    })
    .strict(),
  activation: z
    .object({
      schemaVersion: z.literal(1),
      sourceIdentity: hash,
      snapshotHash: hash,
      status: z.literal("validated"),
      counts,
    })
    .strict(),
  report: z
    .object({
      schemaVersion: z.literal(1),
      status: z.enum(["activated", "already-activated", "rollback-validated"]),
      sourceIdentity: hash,
      snapshotHash: hash,
      counts,
    })
    .strict(),
};
function migrationContract(name, value) {
  const result = schemas[name]?.safeParse(value);
  if (!result?.success) throw new ContractError("MIGRATION_FAILED", 409);
  return result.data;
}
module.exports = { migrationContract, schemas };
