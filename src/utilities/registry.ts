import { cryptoTools } from './cryptoTools';
import { convertTools } from './convertTools';
import { dataTools } from './dataTools';
import { encodeTools } from './encodeTools';
import { idTools } from './idTools';
import { mathTools } from './mathTools';
import { referenceTools } from './referenceTools';
import { securityTools } from './securityTools';
import { textExtraTools } from './textExtraTools';
import { textTools } from './textTools';
import { webTools } from './webTools';
import type { UtilityTool } from './types';

export const UTILITY_TOOLS: UtilityTool[] = [
    ...encodeTools,
    ...cryptoTools,
    ...securityTools,
    ...idTools,
    ...convertTools,
    ...mathTools,
    ...textTools,
    ...textExtraTools,
    ...dataTools,
    ...referenceTools,
    ...webTools,
];
