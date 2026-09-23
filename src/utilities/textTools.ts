import * as crypto from 'crypto';
import { choice, escapeHtml, linesOf, readInteger, requireText } from './common';
import type { UtilityResult, UtilityTool } from './types';

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(
    ' ',
);

const NATO: Record<string, string> = {
    A: 'Alfa',
    B: 'Bravo',
    C: 'Charlie',
    D: 'Delta',
    E: 'Echo',
    F: 'Foxtrot',
    G: 'Golf',
    H: 'Hotel',
    I: 'India',
    J: 'Juliett',
    K: 'Kilo',
    L: 'Lima',
    M: 'Mike',
    N: 'November',
    O: 'Oscar',
    P: 'Papa',
    Q: 'Quebec',
    R: 'Romeo',
    S: 'Sierra',
    T: 'Tango',
    U: 'Uniform',
    V: 'Victor',
    W: 'Whiskey',
    X: 'X-ray',
    Y: 'Yankee',
    Z: 'Zulu',
    '0': 'Zero',
    '1': 'One',
    '2': 'Two',
    '3': 'Three',
    '4': 'Four',
    '5': 'Five',
    '6': 'Six',
    '7': 'Seven',
    '8': 'Eight',
    '9': 'Nine',
};

const CONTROLS = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI', 'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];

export function testRegex(pattern: string, flags: string, text: string): string {
    if (pattern.length > 200) {
        throw new Error('Pattern is limited to 200 characters.');
    }
    if (text.length > 20000) {
        throw new Error('Regex text is limited to 20,000 characters.');
    }
    const uniqueFlags = uniqueRegexFlags(flags);
    const expression = new RegExp(pattern, uniqueFlags.includes('g') ? uniqueFlags : `${uniqueFlags}g`);
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text)) && matches.length < 100) {
        const groups = match.slice(1).map((group, index) => ` (${index + 1}) ${group ?? ''}`);
        matches.push(`[${matches.length}] ${JSON.stringify(match[0])}  ${match.index}-${match.index + match[0].length}${groups.join('')}`);
        if (match[0].length === 0) {
            expression.lastIndex += 1;
        }
    }
    return matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}\n${matches.join('\n')}` : 'No matches';
}

export function testGlob(pattern: string, candidates: string): string {
    const expression = globToRegExp(requireText(pattern, 'Pattern'));
    const lines = linesOf(candidates).filter((line) => line.length > 0);
    const matched = lines.filter((line) => expression.test(line));
    return matched.length ? matched.join('\n') : 'No matches';
}

export function diffText(left: string, right: string, mode: string): string {
    const a = linesOf(left);
    const b = linesOf(right);
    if (mode === 'left') {
        const rightSet = new Set(b);
        return a.filter((line) => !rightSet.has(line)).join('\n');
    }
    if (mode === 'right') {
        const leftSet = new Set(a);
        return b.filter((line) => !leftSet.has(line)).join('\n');
    }
    if (mode === 'both') {
        const rightSet = new Set(b);
        return a.filter((line) => rightSet.has(line)).join('\n');
    }
    if (a.length * b.length > 250000) {
        throw new Error('Diff supports up to about 500 lines on each side.');
    }
    const ops = lineDiff(a, b);
    const removed = ops.filter((op) => op.type === 'delete').length;
    const added = ops.filter((op) => op.type === 'insert').length;
    const body = ops
        .map((op) => `${op.type === 'delete' ? '-' : op.type === 'insert' ? '+' : ' '} ${op.line}`)
        .join('\n');
    return `${removed} removed, ${added} added\n${body}`;
}

export function textStats(value: string): string {
    const lines = linesOf(value);
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    const chars = Array.from(value).length;
    const noSpace = Array.from(value.replace(/\s/g, '')).length;
    const bytes = Buffer.byteLength(value, 'utf8');
    const sentences = value.split(/[.!?]+/).filter((part) => part.trim()).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return [`Characters: ${chars}`, `Characters without whitespace: ${noSpace}`, `UTF-8 bytes: ${bytes}`, `Words: ${words}`, `Lines: ${value ? lines.length : 0}`, `Sentences: ${sentences}`, `Reading time: ${words === 0 ? '0 minutes' : `${minutes} minute${minutes === 1 ? '' : 's'}`}`].join('\n');
}

export function transformLines(value: string, operation: string, extra: string): string {
    let lines = linesOf(value);
    if (operation === 'sort-asc') {
        lines = [...lines].sort((left, right) => left.localeCompare(right));
    } else if (operation === 'sort-desc') {
        lines = [...lines].sort((left, right) => right.localeCompare(left));
    } else if (operation === 'unique') {
        lines = [...new Set(lines)];
    } else if (operation === 'reverse') {
        lines = [...lines].reverse();
    } else if (operation === 'trim') {
        lines = [lines.join('\n').trim()];
    } else if (operation === 'trim-lines') {
        lines = lines.map((line) => line.trim());
    } else if (operation === 'drop-empty') {
        lines = lines.filter((line) => line.trim());
    } else if (operation === 'number') {
        lines = lines.map((line, index) => `${index + 1}. ${line}`);
    } else if (operation === 'prefix') {
        lines = lines.map((line) => `${extra}${line}`);
    } else if (operation === 'suffix') {
        lines = lines.map((line) => `${line}${extra}`);
    } else if (operation === 'shuffle') {
        lines = shuffle(lines);
    } else {
        throw new Error('Unknown line operation.');
    }
    return lines.join('\n');
}

export function lorem(count: number, unit: string): string {
    if (unit === 'words') {
        return Array.from({ length: count }, (_, index) => LOREM[index % LOREM.length]).join(' ');
    }
    if (unit === 'sentences') {
        return Array.from({ length: count }, (_, index) => sentence(index)).join(' ');
    }
    return Array.from({ length: count }, (_, index) => Array.from({ length: 4 }, (__, sentenceIndex) => sentence(index * 4 + sentenceIndex)).join(' ')).join('\n\n');
}

export function renderMarkdown(value: string): { text: string; html: string } {
    const html = markdownToHtml(value);
    return { text: 'Preview rendered below.', html };
}

export function asciiTable(query: string): string {
    const needle = query.trim().toLowerCase();
    const rows: string[] = [];
    for (let code = 0; code < 128; code += 1) {
        const label = code < 32 ? CONTROLS[code] : code === 127 ? 'DEL' : String.fromCharCode(code);
        const row = `${String(code).padStart(3, ' ')}  U+${code.toString(16).padStart(4, '0').toUpperCase()}  ${label}`;
        if (!needle || row.toLowerCase().includes(needle) || label.toLowerCase() === needle) {
            rows.push(row);
        }
    }
    return rows.join('\n') || 'No ASCII rows match.';
}

export function inspectCharacters(value: string): string {
    return Array.from(value)
        .map((char) => {
            const code = char.codePointAt(0) ?? 0;
            const label = code < 32 ? CONTROLS[code] : code === 127 ? 'DEL' : char;
            return `${JSON.stringify(label)}  U+${code.toString(16).toUpperCase().padStart(4, '0')}  ${code}`;
        })
        .join('\n');
}

export function toNato(value: string): string {
    return Array.from(value)
        .map((char) => NATO[char.toUpperCase()] ?? char)
        .join(' ');
}

export function evaluateJsonPath(json: string, path: string): string {
    const data: unknown = JSON.parse(json);
    const matches = walkJsonPath(data, tokenizeJsonPath(requireText(path, 'JSONPath')));
    return JSON.stringify(matches.slice(0, 200), null, 2);
}

export function jsonToTypeScript(json: string, rootName: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rootName)) {
        throw new Error('Interface name must be a TypeScript identifier.');
    }
    const value: unknown = JSON.parse(json);
    const interfaces: string[] = [];
    const root = inferType(value, rootName, interfaces, new Map());
    const body = interfaces.join('\n\n');
    if (root === rootName && interfaces.some((item) => item.startsWith(`export interface ${rootName} {`))) {
        return `${body}\n`;
    }
    return `${body}${body ? '\n\n' : ''}export type ${rootName} = ${root};\n`;
}

export function convertConfig(value: string, format: string, action: string): string {
    if (action === 'from-json') {
        const parsed: unknown = JSON.parse(value);
        if (format === 'env') {
            return jsonToEnv(parsed);
        }
        if (format === 'properties') {
            return jsonToProperties(parsed);
        }
        return jsonToIni(parsed);
    }
    if (format === 'env') {
        return JSON.stringify(parseEnv(value), null, 2);
    }
    if (format === 'properties') {
        return JSON.stringify(parseProperties(value), null, 2);
    }
    return JSON.stringify(parseIni(value), null, 2);
}

export function formatCss(value: string): string {
    const source = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    let indent = 0;
    let output = '';
    let quote: string | undefined;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            output += char;
            if (char === quote && source[index - 1] !== '\\') {
                quote = undefined;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            output += char;
            continue;
        }
        if (char === '{') {
            output = `${output.trimEnd()} {\n${'  '.repeat(++indent)}`;
            continue;
        }
        if (char === '}') {
            indent = Math.max(0, indent - 1);
            output = `${output.trimEnd()}\n${'  '.repeat(indent)}}\n${'  '.repeat(indent)}`;
            continue;
        }
        if (char === ';') {
            output = `${output.trimEnd()};\n${'  '.repeat(indent)}`;
            continue;
        }
        if (/\s/.test(char)) {
            if (output && !/\s$/.test(output)) {
                output += ' ';
            }
            continue;
        }
        output += char;
    }
    return output.trim();
}

export function minifyCss(value: string): string {
    return formatCss(value).replace(/\s*([{}:;,])\s*/g, '$1').replace(/;}/g, '}');
}

export function formatHtml(value: string): string {
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const tokens = value.replace(/>\s+</g, '><').split(/(<[^>]+>)/).filter((token) => token.trim());
    let indent = 0;
    const lines: string[] = [];
    for (const token of tokens) {
        const closing = /^<\//.test(token);
        const opening = /^<([a-zA-Z0-9:-]+)/.exec(token);
        const selfClosing = /\/>$/.test(token) || (opening ? voidTags.has(opening[1].toLowerCase()) : false);
        if (closing) {
            indent = Math.max(0, indent - 1);
        }
        lines.push(`${'  '.repeat(indent)}${token.trim()}`);
        if (opening && !closing && !selfClosing) {
            indent += 1;
        }
    }
    return lines.join('\n');
}

export function minifyHtml(value: string): string {
    return value.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').trim();
}

export function stripHtml(value: string): string {
    return decodeBasicEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function uniqueRegexFlags(flags: string): string {
    const allowed = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v']);
    const unique: string[] = [];
    for (const flag of flags) {
        if (!allowed.has(flag)) {
            throw new Error(`Unsupported regex flag: ${flag}`);
        }
        if (!unique.includes(flag)) {
            unique.push(flag);
        }
    }
    if (unique.includes('u') && unique.includes('v')) {
        throw new Error('Use either the u flag or the v flag.');
    }
    return unique.join('');
}

function globToRegExp(pattern: string): RegExp {
    let body = '^';
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        if (char === '*') {
            if (pattern[index + 1] === '*') {
                index += 1;
                if (pattern[index + 1] === '/') {
                    index += 1;
                }
                body += '(?:.*\\/)?';
            } else {
                body += '[^/]*';
            }
            continue;
        }
        body += char === '?' ? '[^/]' : escapeRegExp(char);
    }
    return new RegExp(`${body}$`);
}

function escapeRegExp(value: string): string {
    return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function lineDiff(left: string[], right: string[]): Array<{ type: 'equal' | 'insert' | 'delete'; line: string }> {
    const scores = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
    for (let row = left.length - 1; row >= 0; row -= 1) {
        for (let column = right.length - 1; column >= 0; column -= 1) {
            scores[row][column] = left[row] === right[column] ? scores[row + 1][column + 1] + 1 : Math.max(scores[row + 1][column], scores[row][column + 1]);
        }
    }
    const ops: Array<{ type: 'equal' | 'insert' | 'delete'; line: string }> = [];
    let row = 0;
    let column = 0;
    while (row < left.length && column < right.length) {
        if (left[row] === right[column]) {
            ops.push({ type: 'equal', line: left[row] });
            row += 1;
            column += 1;
        } else if (scores[row + 1][column] >= scores[row][column + 1]) {
            ops.push({ type: 'delete', line: left[row] });
            row += 1;
        } else {
            ops.push({ type: 'insert', line: right[column] });
            column += 1;
        }
    }
    while (row < left.length) {
        ops.push({ type: 'delete', line: left[row] });
        row += 1;
    }
    while (column < right.length) {
        ops.push({ type: 'insert', line: right[column] });
        column += 1;
    }
    return ops;
}

function shuffle<T>(values: T[]): T[] {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = crypto.randomInt(index + 1);
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
}

function sentence(seed: number): string {
    const words = Array.from({ length: 8 }, (_, index) => LOREM[(seed * 3 + index) % LOREM.length]);
    return `${words[0].charAt(0).toUpperCase()}${words[0].slice(1)} ${words.slice(1).join(' ')}.`;
}

function markdownToHtml(value: string): string {
    const lines = linesOf(value);
    const blocks: string[] = [];
    let index = 0;
    while (index < lines.length) {
        if (!lines[index].trim()) {
            index += 1;
            continue;
        }
        if (lines[index].startsWith('```')) {
            const body: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].startsWith('```')) {
                body.push(lines[index]);
                index += 1;
            }
            index += 1;
            blocks.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
            continue;
        }
        if (/^#{1,6}\s+/.test(lines[index])) {
            const level = lines[index].match(/^#+/)?.[0].length ?? 1;
            blocks.push(`<h${level}>${inlineMarkdown(lines[index].replace(/^#{1,6}\s+/, ''))}</h${level}>`);
            index += 1;
            continue;
        }
        if (/^(-{3,}|\*{3,})$/.test(lines[index].trim())) {
            blocks.push('<hr>');
            index += 1;
            continue;
        }
        if (/^>\s?/.test(lines[index])) {
            const quote: string[] = [];
            while (index < lines.length && /^>\s?/.test(lines[index])) {
                quote.push(lines[index].replace(/^>\s?/, ''));
                index += 1;
            }
            blocks.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`);
            continue;
        }
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[index])) {
            const ordered = /^\s*\d+\.\s+/.test(lines[index]);
            const items: string[] = [];
            while (index < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[index])) {
                items.push(`<li>${inlineMarkdown(lines[index].replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`);
                index += 1;
            }
            blocks.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
            continue;
        }
        const paragraph: string[] = [];
        while (index < lines.length && lines[index].trim() && !/^```|^#{1,6}\s+|^>\s?|^\s*([-*]|\d+\.)\s+|^(-{3,}|\*{3,})$/.test(lines[index])) {
            paragraph.push(lines[index]);
            index += 1;
        }
        blocks.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    }
    return blocks.join('\n');
}

function inlineMarkdown(value: string): string {
    const parts: string[] = [];
    const pattern = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)/g;
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
        const index = match.index ?? 0;
        parts.push(escapeHtml(value.slice(cursor, index)));
        if (match[1]) {
            parts.push(`<code>${escapeHtml(match[1].slice(1, -1))}</code>`);
        } else if (match[2]) {
            const href = safeUrl(match[4]);
            parts.push(href ? `<a href="${escapeHtml(href)}">${escapeHtml(match[3])}</a>` : escapeHtml(match[3]));
        } else if (match[5] || match[7]) {
            parts.push(`<strong>${escapeHtml(match[6] || match[8])}</strong>`);
        } else if (match[9]) {
            parts.push(`<em>${escapeHtml(match[10])}</em>`);
        }
        cursor = index + match[0].length;
    }
    parts.push(escapeHtml(value.slice(cursor)));
    return parts.join('');
}

function safeUrl(value: string): string | undefined {
    try {
        const url = new URL(value);
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
            return url.href;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

type JsonToken = { kind: 'child'; name: string } | { kind: 'wildcard' } | { kind: 'index'; index: number } | { kind: 'slice'; start: number; end?: number } | { kind: 'recursive'; name: string };

function tokenizeJsonPath(path: string): JsonToken[] {
    const text = path.trim();
    if (!text.startsWith('$')) {
        throw new Error('JSONPath must start with $.');
    }
    const tokens: JsonToken[] = [];
    let index = 1;
    while (index < text.length) {
        if (text.startsWith('..', index)) {
            index += 2;
            const name = readJsonName(text, index);
            tokens.push({ kind: 'recursive', name: name.value });
            index = name.next;
            continue;
        }
        if (text[index] === '.') {
            index += 1;
            if (text[index] === '*') {
                tokens.push({ kind: 'wildcard' });
                index += 1;
                continue;
            }
            const name = readJsonName(text, index);
            tokens.push({ kind: 'child', name: name.value });
            index = name.next;
            continue;
        }
        if (text[index] === '[') {
            const end = text.indexOf(']', index);
            if (end < 0) {
                throw new Error('Unclosed JSONPath bracket.');
            }
            const body = text.slice(index + 1, end).trim();
            if (body === '*') {
                tokens.push({ kind: 'wildcard' });
            } else if (/^-?\d+$/.test(body)) {
                tokens.push({ kind: 'index', index: Number(body) });
            } else if (/^(-?\d+)?:(-?\d+)?$/.test(body)) {
                const [start, finish] = body.split(':');
                tokens.push({ kind: 'slice', start: start ? Number(start) : 0, end: finish ? Number(finish) : undefined });
            } else if (/^(['"])(.*)\1$/.test(body)) {
                tokens.push({ kind: 'child', name: body.slice(1, -1) });
            } else {
                throw new Error(`Unsupported JSONPath selector ${body}.`);
            }
            index = end + 1;
            continue;
        }
        throw new Error(`Unexpected JSONPath character ${text[index]}.`);
    }
    return tokens;
}

function readJsonName(path: string, start: number): { value: string; next: number } {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(path.slice(start));
    if (!match) {
        throw new Error('JSONPath property name is missing.');
    }
    return { value: match[0], next: start + match[0].length };
}

function walkJsonPath(data: unknown, tokens: JsonToken[]): unknown[] {
    let current = [data];
    for (const token of tokens) {
        const next: unknown[] = [];
        for (const item of current) {
            if (token.kind === 'recursive') {
                collectNamed(item, token.name, next, new Set());
                continue;
            }
            if (token.kind === 'wildcard') {
                if (Array.isArray(item)) {
                    next.push(...item);
                } else if (item && typeof item === 'object') {
                    next.push(...Object.values(item));
                }
                continue;
            }
            if (token.kind === 'child') {
                if (item && typeof item === 'object' && !Array.isArray(item) && Object.prototype.hasOwnProperty.call(item, token.name)) {
                    next.push((item as Record<string, unknown>)[token.name]);
                }
                continue;
            }
            if (!Array.isArray(item)) {
                continue;
            }
            if (token.kind === 'index') {
                const index = token.index < 0 ? item.length + token.index : token.index;
                if (index >= 0 && index < item.length) {
                    next.push(item[index]);
                }
                continue;
            }
            const start = token.start < 0 ? item.length + token.start : token.start;
            const end = token.end === undefined ? item.length : token.end < 0 ? item.length + token.end : token.end;
            next.push(...item.slice(start, end));
        }
        current = next;
        if (current.length > 200) {
            return current.slice(0, 200);
        }
    }
    return current;
}

function collectNamed(value: unknown, name: string, output: unknown[], seen: Set<object>): void {
    if (!value || typeof value !== 'object') {
        return;
    }
    if (seen.has(value)) {
        return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
        for (const item of value) {
            collectNamed(item, name, output, seen);
        }
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        if (key === name) {
            output.push(child);
        }
        collectNamed(child, name, output, seen);
    }
}

function inferType(value: unknown, name: string, interfaces: string[], used: Map<string, number>): string {
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return 'unknown[]';
        }
        if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
            const merged = mergeObjects(value as Array<Record<string, unknown>>);
            const item = objectInterface(`${name}Item`, merged.keys, merged.optional, interfaces, used);
            interfaces.push(item.text);
            return `${item.name}[]`;
        }
        return `${inferType(value[0], name, interfaces, used)}[]`;
    }
    if (value && typeof value === 'object') {
        const item = objectInterface(name, value as Record<string, unknown>, new Set(), interfaces, used);
        interfaces.push(item.text);
        return item.name;
    }
    if (value === null) {
        return 'null';
    }
    return typeof value;
}

function mergeObjects(items: Array<Record<string, unknown>>): { keys: Record<string, unknown>; optional: Set<string> } {
    const keys: Record<string, unknown> = {};
    const optional = new Set<string>();
    const names = new Set<string>();
    for (const item of items) {
        for (const key of Object.keys(item)) {
            names.add(key);
            if (!(key in keys)) {
                keys[key] = item[key];
            }
        }
    }
    for (const name of names) {
        if (items.some((item) => !(name in item))) {
            optional.add(name);
        }
    }
    return { keys, optional };
}

function objectInterface(
    name: string,
    value: Record<string, unknown>,
    optional: Set<string>,
    interfaces: string[],
    used: Map<string, number>,
): { name: string; text: string } {
    const unique = uniqueName(name, used);
    const fields = Object.entries(value).map(([key, field]) => {
        const fieldName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
        const fieldType = inferType(field, `${unique}${pascal(key)}`, interfaces, used);
        return `    ${fieldName}${optional.has(key) ? '?' : ''}: ${fieldType};`;
    });
    return { name: unique, text: `export interface ${unique} {\n${fields.join('\n')}\n}` };
}

function uniqueName(name: string, used: Map<string, number>): string {
    const count = used.get(name) ?? 0;
    used.set(name, count + 1);
    return count === 0 ? name : `${name}${count + 1}`;
}

function pascal(value: string): string {
    const cleaned = value.replace(/[^A-Za-z0-9]+/g, ' ').trim();
    return cleaned ? cleaned.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('') : 'Field';
}

function parseEnv(value: string): Record<string, string> {
    const output: Record<string, string> = {};
    for (const raw of linesOf(value)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const body = line.startsWith('export ') ? line.slice(7).trim() : line;
        const separator = body.indexOf('=');
        if (separator <= 0) {
            throw new Error(`Invalid env line: ${raw}`);
        }
        const key = body.slice(0, separator).trim();
        let item = body.slice(separator + 1);
        if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
            item = item.slice(1, -1);
        }
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            throw new Error(`Invalid env key: ${key}`);
        }
        output[key] = item;
    }
    return output;
}

function parseProperties(value: string): Record<string, string> {
    const output: Record<string, string> = {};
    for (const raw of linesOf(value)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) {
            continue;
        }
        const match = line.match(/^([^=:\s]+)\s*[=:]\s*(.*)$/);
        if (!match) {
            throw new Error(`Invalid properties line: ${raw}`);
        }
        output[match[1]] = match[2];
    }
    return output;
}

function parseIni(value: string): { globals: Record<string, string>; sections: Record<string, Record<string, string>> } {
    const globals: Record<string, string> = {};
    const sections: Record<string, Record<string, string>> = {};
    let current = globals;
    for (const raw of linesOf(value)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) {
            continue;
        }
        const section = line.match(/^\[(.+)]$/);
        if (section) {
            current = sections[section[1]] ?? (sections[section[1]] = {});
            continue;
        }
        const separator = line.indexOf('=');
        if (separator <= 0) {
            throw new Error(`Invalid INI line: ${raw}`);
        }
        current[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    return { globals, sections };
}

function jsonToEnv(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Env output needs a flat JSON object.');
    }
    return Object.entries(value)
        .map(([key, item]) => {
            if (item && typeof item === 'object') {
                throw new Error('Env output cannot contain nested objects.');
            }
            return `${key}=${item ?? ''}`;
        })
        .join('\n');
}

function jsonToProperties(value: unknown): string {
    return jsonToEnv(value).replace(/=/g, ' = ');
}

function jsonToIni(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('INI output needs an object with globals and sections.');
    }
    const record = value as { globals?: Record<string, string>; sections?: Record<string, Record<string, string>> };
    const globals = record.globals ?? {};
    const sections = record.sections ?? {};
    const lines = Object.entries(globals).map(([key, item]) => `${key}=${item}`);
    for (const [name, entries] of Object.entries(sections)) {
        lines.push('', `[${name}]`);
        for (const [key, item] of Object.entries(entries)) {
            lines.push(`${key}=${item}`);
        }
    }
    return lines.join('\n').trim();
}

function decodeBasicEntities(value: string): string {
    return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const lineOperations = [
    ['sort-asc', 'Sort A to Z'],
    ['sort-desc', 'Sort Z to A'],
    ['unique', 'Unique'],
    ['reverse', 'Reverse'],
    ['trim', 'Trim text'],
    ['trim-lines', 'Trim lines'],
    ['drop-empty', 'Drop empty lines'],
    ['number', 'Number lines'],
    ['prefix', 'Prefix lines'],
    ['suffix', 'Suffix lines'],
    ['shuffle', 'Shuffle'],
].map(([value, label]) => ({ value, label }));

export const textTools: UtilityTool[] = [
    {
        id: 'regex',
        label: 'Regex Tester',
        description: 'Test a JavaScript regular expression',
        command: 'devx.regexTool',
        icon: 'regex.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Runs a JavaScript regular expression in the extension host. Patterns are limited to 200 characters and text to 20,000 characters.',
        fields: [
            { id: 'pattern', label: 'Pattern', kind: 'text', placeholder: '\\w+' },
            { id: 'flags', label: 'Flags', kind: 'text', placeholder: 'i' },
            { id: 'text', label: 'Text', kind: 'textarea', rows: 8 },
        ],
        actions: [{ id: 'test', label: 'Test' }],
        run: (_action, values) => ({ output: testRegex(requireText(values.pattern, 'Pattern'), values.flags ?? '', values.text ?? '') }),
    },
    {
        id: 'glob',
        label: 'Glob Tester',
        description: 'Match paths against a glob',
        command: 'devx.globTool',
        icon: 'glob.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Supports *, ?, and **. Put one candidate path on each line.',
        fields: [
            { id: 'pattern', label: 'Glob', kind: 'text', placeholder: 'src/**/*.ts' },
            { id: 'text', label: 'Paths', kind: 'textarea', rows: 8 },
        ],
        actions: [{ id: 'test', label: 'Test' }],
        run: (_action, values) => ({ output: testGlob(values.pattern ?? '', values.text ?? '') }),
    },
    {
        id: 'diff',
        label: 'Text Diff',
        description: 'Compare two text blocks or line sets',
        command: 'devx.diffTool',
        icon: 'diff.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Line diff, or set comparisons for lines only on the left, only on the right, or in both.',
        fields: [
            { id: 'left', label: 'Left', kind: 'textarea', rows: 8 },
            { id: 'right', label: 'Right', kind: 'textarea', rows: 8 },
            {
                id: 'mode',
                label: 'Mode',
                kind: 'select',
                options: [
                    { value: 'diff', label: 'Line diff' },
                    { value: 'left', label: 'Only left' },
                    { value: 'right', label: 'Only right' },
                    { value: 'both', label: 'In both' },
                ],
                defaultValue: 'diff',
            },
        ],
        actions: [{ id: 'compare', label: 'Compare' }],
        run: (_action, values) => ({
            output: diffText(values.left ?? '', values.right ?? '', choice(values.mode, 'mode', ['diff', 'left', 'right', 'both'], 'diff')),
        }),
    },
    {
        id: 'stats',
        label: 'Text Statistics',
        description: 'Count characters, words, lines, and bytes',
        command: 'devx.textStatsTool',
        icon: 'stats.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Counts characters, UTF-8 bytes, words, lines, sentences, and a 200-words-per-minute reading time.',
        fields: [{ id: 'input', label: 'Text', kind: 'textarea', rows: 8 }],
        actions: [{ id: 'count', label: 'Count' }],
        run: (_action, values) => ({ output: textStats(values.input ?? '') }),
    },
    {
        id: 'lines',
        label: 'Line Tools',
        description: 'Sort, unique, number, and reshape lines',
        command: 'devx.lineToolsTool',
        icon: 'lines.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Sort, dedupe, reverse, trim, number, prefix, suffix, or shuffle lines.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 8 },
            { id: 'operation', label: 'Operation', kind: 'select', options: lineOperations, defaultValue: 'sort-asc' },
            { id: 'extra', label: 'Prefix or suffix', kind: 'text' },
        ],
        actions: [{ id: 'run', label: 'Apply' }],
        run: (_action, values) => ({
            output: transformLines(values.input ?? '', choice(values.operation, 'operation', lineOperations.map((item) => item.value), 'sort-asc'), values.extra ?? ''),
        }),
    },
    {
        id: 'lorem',
        label: 'Lorem Ipsum',
        description: 'Generate placeholder text',
        command: 'devx.loremTool',
        icon: 'lorem.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Classic placeholder copy as words, sentences, or paragraphs.',
        fields: [
            { id: 'count', label: 'Count', kind: 'number', defaultValue: '2' },
            {
                id: 'unit',
                label: 'Unit',
                kind: 'select',
                options: [
                    { value: 'paragraphs', label: 'Paragraphs' },
                    { value: 'sentences', label: 'Sentences' },
                    { value: 'words', label: 'Words' },
                ],
                defaultValue: 'paragraphs',
            },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({
            output: lorem(readInteger(values.count, 'Count', 1, 50), choice(values.unit, 'unit', ['paragraphs', 'sentences', 'words'], 'paragraphs')),
        }),
    },
    {
        id: 'markdown',
        label: 'Markdown Preview',
        description: 'Preview a safe Markdown subset',
        command: 'devx.markdownTool',
        icon: 'markdown.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Renders headings, lists, quotes, fences, emphasis, and http(s)/mailto links. Raw HTML is escaped.',
        fields: [{ id: 'input', label: 'Markdown', kind: 'textarea', rows: 12, placeholder: '# Title' }],
        actions: [{ id: 'preview', label: 'Preview' }],
        run: (_action, values) => {
            const rendered = renderMarkdown(values.input ?? '');
            return { output: rendered.text, previewHtml: rendered.html };
        },
    },
    {
        id: 'ascii',
        label: 'ASCII / Code Points',
        description: 'Browse ASCII or inspect characters',
        command: 'devx.asciiTool',
        icon: 'ascii.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Search the ASCII table, or list Unicode code points in the text you enter.',
        fields: [{ id: 'input', label: 'Search or text', kind: 'textarea', rows: 4 }],
        actions: [
            { id: 'table', label: 'ASCII table' },
            { id: 'inspect', label: 'Inspect text' },
        ],
        run: (action, values) => ({ output: action === 'inspect' ? inspectCharacters(requireText(values.input, 'Text')) : asciiTable(values.input ?? '') }),
    },
    {
        id: 'nato',
        label: 'NATO Phonetic',
        description: 'Spell text with the phonetic alphabet',
        command: 'devx.natoTool',
        icon: 'nato.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'ITU phonetic alphabet for letters and digits. Other characters are kept in place.',
        fields: [{ id: 'input', label: 'Text', kind: 'text', placeholder: 'VS Code' }],
        actions: [{ id: 'spell', label: 'Spell' }],
        run: (_action, values) => ({ output: toNato(requireText(values.input, 'Text')) }),
    },
    {
        id: 'jsonpath',
        label: 'JSONPath',
        description: 'Query JSON with a small JSONPath subset',
        command: 'devx.jsonPathTool',
        icon: 'jsonpath.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Supports $.a, [0], [*], [start:end], ["name"], and ..name. Results are capped at 200 matches.',
        fields: [
            { id: 'json', label: 'JSON', kind: 'textarea', rows: 10 },
            { id: 'path', label: 'JSONPath', kind: 'text', placeholder: '$.store.book[0].title' },
        ],
        actions: [{ id: 'query', label: 'Query' }],
        run: (_action, values) => {
            try {
                return { output: evaluateJsonPath(requireText(values.json, 'JSON'), values.path ?? '') };
            } catch (error) {
                if (error instanceof SyntaxError) {
                    throw new Error('JSON could not be parsed.');
                }
                throw error;
            }
        },
    },
    {
        id: 'json-ts',
        label: 'JSON to TypeScript',
        description: 'Infer interfaces from JSON',
        command: 'devx.jsonToTsTool',
        icon: 'json-ts.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Builds interfaces from a JSON value. Object arrays are merged, and keys missing from some items become optional.',
        fields: [
            { id: 'json', label: 'JSON', kind: 'textarea', rows: 10 },
            { id: 'name', label: 'Root name', kind: 'text', defaultValue: 'Root' },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => {
            try {
                return { output: jsonToTypeScript(requireText(values.json, 'JSON'), (values.name || 'Root').trim() || 'Root') };
            } catch (error) {
                if (error instanceof SyntaxError) {
                    throw new Error('JSON could not be parsed.');
                }
                throw error;
            }
        },
    },
    {
        id: 'config',
        label: 'Env / INI / Properties',
        description: 'Convert env, INI, and properties files',
        command: 'devx.configFormatTool',
        icon: 'env.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Parse dotenv, INI, or Java properties into JSON, or write those formats from JSON.',
        fields: [
            { id: 'input', label: 'Text or JSON', kind: 'textarea', rows: 10 },
            {
                id: 'format',
                label: 'Format',
                kind: 'select',
                options: [
                    { value: 'env', label: 'dotenv' },
                    { value: 'ini', label: 'INI' },
                    { value: 'properties', label: 'Properties' },
                ],
                defaultValue: 'env',
            },
        ],
        actions: [
            { id: 'to-json', label: 'To JSON' },
            { id: 'from-json', label: 'From JSON' },
        ],
        run: (action, values) => {
            try {
                return {
                    output: convertConfig(requireText(values.input, 'Input'), choice(values.format, 'format', ['env', 'ini', 'properties'], 'env'), action),
                };
            } catch (error) {
                if (error instanceof SyntaxError) {
                    throw new Error('JSON could not be parsed.');
                }
                throw error;
            }
        },
    },
    {
        id: 'css',
        label: 'CSS Formatter',
        description: 'Format or minify CSS',
        command: 'devx.cssFormatTool',
        icon: 'css.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Indent CSS rules or collapse them. Comments are removed.',
        fields: [{ id: 'input', label: 'CSS', kind: 'textarea', rows: 10 }],
        actions: [
            { id: 'format', label: 'Format' },
            { id: 'minify', label: 'Minify' },
        ],
        run: (action, values) => ({ output: action === 'minify' ? minifyCss(requireText(values.input, 'CSS')) : formatCss(requireText(values.input, 'CSS')) }),
    },
    {
        id: 'html-format',
        label: 'HTML Formatter',
        description: 'Format, minify, or strip HTML',
        command: 'devx.htmlFormatTool',
        icon: 'html-format.svg',
        defaultVisible: true,
        category: 'Text',
        summary: 'Indent markup, collapse whitespace between tags, or strip tags to text.',
        fields: [{ id: 'input', label: 'HTML', kind: 'textarea', rows: 10 }],
        actions: [
            { id: 'format', label: 'Format' },
            { id: 'minify', label: 'Minify' },
            { id: 'strip', label: 'Strip tags' },
        ],
        run: (action, values) => {
            const input = requireText(values.input, 'HTML');
            if (action === 'minify') {
                return { output: minifyHtml(input) };
            }
            if (action === 'strip') {
                return { output: stripHtml(input) };
            }
            return { output: formatHtml(input) };
        },
    },
];
