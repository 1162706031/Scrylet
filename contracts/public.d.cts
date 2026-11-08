import type { ZodType } from 'zod';
import type { ContractMap } from './index.js';
export const schemas: { [K in Exclude<keyof ContractMap, 'processMessage' | 'nativeEvent'>]: ZodType<ContractMap[K]> };
