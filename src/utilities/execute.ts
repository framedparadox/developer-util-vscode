import { assertInputSize } from '../limits';
import { UTILITY_TOOLS } from './registry';
import type { UtilityResult, UtilityTool } from './types';

export function getUtilityTool(id: string): UtilityTool {
    const tool = UTILITY_TOOLS.find((item) => item.id === id);
    if (!tool) {
        throw new Error('Unknown tool.');
    }
    return tool;
}

export async function executeUtility(
    toolId: string,
    action: string,
    raw: unknown,
    extra: Record<string, string> = {},
): Promise<UtilityResult> {
    const tool = getUtilityTool(toolId);
    if (tool.presentation !== 'keycode' && !tool.actions.some((item) => item.id === action)) {
        throw new Error('Unknown action.');
    }
    if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
        throw new Error('Invalid input.');
    }

    const source = (raw ?? {}) as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const field of tool.fields) {
        const incoming = source[field.id];
        if (incoming === undefined || incoming === null || incoming === '') {
            values[field.id] = field.defaultValue ?? '';
            continue;
        }
        if (typeof incoming !== 'string') {
            throw new Error(`${field.label} must be text.`);
        }
        if (field.kind === 'textarea' || field.kind === 'text') {
            assertInputSize(incoming, field.label);
        }
        if (field.kind === 'select' && !field.options?.some((option) => option.value === incoming)) {
            throw new Error(`Invalid ${field.label}.`);
        }
        if (field.kind === 'number' && !/^-?\d+(\.\d+)?$/.test(incoming.trim())) {
            throw new Error(`${field.label} must be a number.`);
        }
        values[field.id] = incoming;
    }

    for (const key of tool.inject ?? []) {
        const injected = extra[key];
        if (typeof injected === 'string') {
            assertInputSize(injected, key);
            values[key] = injected;
        }
    }

    return tool.run(action, values);
}
