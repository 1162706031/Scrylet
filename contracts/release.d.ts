export type ReleaseGate =
  | "featureParity"
  | "migrationAndRollback"
  | "windowsProductionUpgrade"
  | "windowsNativeAndInstaller"
  | "macArm64PackageAndInstall"
  | "macX64PackageAndInstall"
  | "physicalPhoneAndSpeech"
  | "startupAndSize";
export interface ReleaseEvidence {
  schemaVersion: 1;
  productVersion: string;
  candidateSha256: string;
  gates: Record<
    ReleaseGate,
    { status: "passed" | "failed" | "unverified"; evidence: string[] }
  >;
}
export const gates: readonly ReleaseGate[];
export function validateRelease(value: unknown): ReleaseEvidence;
