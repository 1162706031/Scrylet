export interface MigrationCounts {
  chats: number;
  messages: number;
  files: number;
  prompts: number;
  connections: number;
  conflicts: number;
}
export type MigrationStage =
  | "inspected"
  | "snapshotted"
  | "files"
  | "data"
  | "validated"
  | "activated";
export interface MigrationState {
  schemaVersion: 1;
  runId: string;
  sourceIdentity: string;
  stage: MigrationStage;
  snapshotHash: string | null;
  counts: MigrationCounts | null;
}
export interface MigrationActivation {
  schemaVersion: 1;
  sourceIdentity: string;
  snapshotHash: string;
  status: "validated";
  counts: MigrationCounts;
}
export interface MigrationReport {
  schemaVersion: 1;
  status: "activated" | "already-activated" | "rollback-validated";
  sourceIdentity: string;
  snapshotHash: string;
  counts: MigrationCounts;
}
export function migrationContract(
  name: "state",
  value: unknown,
): MigrationState;
export function migrationContract(
  name: "activation",
  value: unknown,
): MigrationActivation;
export function migrationContract(
  name: "report",
  value: unknown,
): MigrationReport;
