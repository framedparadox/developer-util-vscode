import { ConversionFormat } from './types';

const extensionToFormat: Record<string, ConversionFormat> = {
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    csv: 'csv',
    raml: 'raml',
};

const languageToFormat: Record<string, ConversionFormat> = {
    json: 'json',
    jsonc: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    csv: 'csv',
    raml: 'raml',
};

export function detectDataFormat(content: string, fileName?: string, languageId?: string): ConversionFormat | null {
    const extension = fileName?.split('.').pop()?.toLowerCase();
    if (extension && extensionToFormat[extension]) {
        return extensionToFormat[extension];
    }

    const language = languageId?.toLowerCase();
    if (language && languageToFormat[language]) {
        return languageToFormat[language];
    }

    const trimmed = content.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('#%RAML')) {
        return 'raml';
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return 'json';
    }

    if (trimmed.startsWith('<')) {
        return 'xml';
    }

    const lines = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (looksLikeCsv(lines)) {
        return 'csv';
    }

    if (looksLikeYaml(lines)) {
        return 'yaml';
    }

    return null;
}

function looksLikeCsv(lines: string[]): boolean {
    if (lines.length < 2 || !lines[0].includes(',')) {
        return false;
    }

    const firstColumnCount = lines[0].split(',').length;
    const secondColumnCount = lines[1].split(',').length;
    return firstColumnCount > 1 && firstColumnCount === secondColumnCount && !/:\s*/.test(lines[0]);
}

function looksLikeYaml(lines: string[]): boolean {
    if (lines.length === 0) {
        return false;
    }

    return lines.some((line) => {
        return (
            line === '---' ||
            /^-\s+[^:]+:\s*/.test(line) ||
            /^["']?[\w.-]+["']?\s*:\s*/.test(line) ||
            /^\s*-\s+/.test(line)
        );
    });
}
