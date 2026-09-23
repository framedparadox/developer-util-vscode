import { cryptoTools } from './cryptoTools';
import { convertTools } from './convertTools';
import { encodeTools } from './encodeTools';
import { idTools } from './idTools';
import { referenceTools } from './referenceTools';
import { textTools } from './textTools';
import type { UtilityTool } from './types';

export const UTILITY_TOOLS: UtilityTool[] = [
    ...encodeTools,
    ...cryptoTools,
    ...idTools,
    ...convertTools,
    ...textTools,
    ...referenceTools,
];
