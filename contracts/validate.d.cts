import type * as C from './index.js';
import type { ZodType } from 'zod';
export const schemas: { [K in keyof C.ContractMap]: ZodType<C.ContractMap[K]> };
export function validate<K extends keyof C.ContractMap>(kind: K, value: unknown): C.ContractMap[K];
export function validateGraph(value: unknown): C.Chat;
export function validateEvent(value: unknown, previous: C.Generation): C.GenerationEvent;
export function validateRecovery(value: unknown, previous: C.Generation): C.Generation;
export function validateSubmission(value: unknown, chat: C.Chat, files: ReadonlySet<string>): C.SubmitMessage;
export function assertTransition(from: C.GenerationStatus, to: C.GenerationStatus): void;
export function assertRevision(expected: number, current: number): void;
export function assertReplay(existing: C.RequestIdentity, incoming: C.RequestIdentity): void;
export function parseNativeLine(line: string): C.NativeEvent;
export class ContractError extends Error { code: C.ErrorCode; status: number; constructor(code?: C.ErrorCode, status?: number) }
