export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

export function assertInputSize(value: unknown, label = 'Input'): string {
    if (typeof value !== 'string') {
        throw new Error(`${label} must be text.`);
    }
    if (Buffer.byteLength(value, 'utf8') > MAX_INPUT_BYTES) {
        throw new Error(`${label} exceeds the 10 MB limit.`);
    }
    return value;
}

export function normalizeIndent(value: unknown): number {
    const indent = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(indent) || indent < 1 || indent > 8) {
        throw new Error('Indent must be an integer between 1 and 8.');
    }
    return indent;
}

export function normalizeTabSize(value: unknown): number {
    const tabSize = typeof value === 'number' ? value : Number(value);
    if (tabSize !== 2 && tabSize !== 4 && tabSize !== 8) {
        throw new Error('Tab size must be 2, 4, or 8.');
    }
    return tabSize;
}
