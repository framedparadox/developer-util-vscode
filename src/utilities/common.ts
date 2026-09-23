export function requireText(value: string | undefined, label: string): string {
    const text = value ?? '';
    if (!text.trim()) {
        throw new Error(`${label} is required.`);
    }
    return text;
}

export function readInteger(value: string | undefined, label: string, min: number, max: number): number {
    const text = (value ?? '').trim();
    if (!/^-?\d+$/.test(text)) {
        throw new Error(`${label} must be an integer.`);
    }
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${label} must be an integer between ${min} and ${max}.`);
    }
    return parsed;
}

export function readNumber(value: string | undefined, label: string, min: number, max: number): number {
    const text = (value ?? '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
        throw new Error(`${label} must be a number.`);
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw new Error(`${label} must be between ${min} and ${max}.`);
    }
    return parsed;
}

export function choice(value: string | undefined, label: string, allowed: readonly string[], fallback: string): string {
    const text = (value ?? '').trim();
    const selected = text || fallback;
    if (!allowed.includes(selected)) {
        throw new Error(`Invalid ${label}.`);
    }
    return selected;
}

export function linesOf(value: string): string[] {
    if (!value) {
        return [];
    }
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
