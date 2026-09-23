import * as crypto from 'crypto';
import { choice, readInteger, readNumber, requireText } from './common';
import type { UtilityResult, UtilityTool } from './types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const NAMED_COLORS: Record<string, string> = {
    black: '000000',
    silver: 'c0c0c0',
    gray: '808080',
    white: 'ffffff',
    maroon: '800000',
    red: 'ff0000',
    purple: '800080',
    fuchsia: 'ff00ff',
    green: '008000',
    lime: '00ff00',
    olive: '808000',
    yellow: 'ffff00',
    navy: '000080',
    blue: '0000ff',
    teal: '008080',
    aqua: '00ffff',
    orange: 'ffa500',
    aliceblue: 'f0f8ff',
    antiquewhite: 'faebd7',
    coral: 'ff7f50',
    crimson: 'dc143c',
    cyan: '00ffff',
    gold: 'ffd700',
    indigo: '4b0082',
    ivory: 'fffff0',
    khaki: 'f0e68c',
    magenta: 'ff00ff',
    pink: 'ffc0cb',
    rebeccapurple: '663399',
    salmon: 'fa8072',
    seagreen: '2e8b57',
    skyblue: '87ceeb',
    slategray: '708090',
    tomato: 'ff6347',
    turquoise: '40e0d0',
    violet: 'ee82ee',
    wheat: 'f5deb3',
};

interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface SemVer {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}

type CronZone = 'utc' | 'local';

interface CronParts {
    second: number;
    minute: number;
    hour: number;
    dom: number;
    month: number;
    dow: number;
}

export function formatTimestamp(input: string, now = new Date()): string {
    const date = !input.trim() || input.trim().toLowerCase() === 'now' ? now : parseDate(input.trim());
    const delta = date.getTime() - now.getTime();
    return [
        `ISO 8601: ${date.toISOString()}`,
        `UTC: ${date.toUTCString()}`,
        `Local: ${formatLocal(date)}`,
        `Unix seconds: ${Math.floor(date.getTime() / 1000)}`,
        `Unix milliseconds: ${date.getTime()}`,
        `Relative to now: ${formatRelative(delta)}`,
    ].join('\n');
}

export function convertBase(value: string, fromBase: number, toBase: number): string {
    const text = requireText(value, 'Value').trim().toLowerCase();
    const negative = text.startsWith('-');
    const body = negative ? text.slice(1) : text;
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    if (!body || [...body].some((char) => alphabet.indexOf(char) < 0 || alphabet.indexOf(char) >= fromBase)) {
        throw new Error(`Value contains a digit outside base ${fromBase}.`);
    }
    let numeric = 0n;
    const base = BigInt(fromBase);
    for (const char of body) {
        numeric = numeric * base + BigInt(alphabet.indexOf(char));
    }
    if (negative) {
        numeric = -numeric;
    }
    return formatBigInt(numeric, toBase);
}

export function convertColor(value: string): string {
    const color = parseColor(value);
    const hex = toHex(color);
    const hsl = rgbToHsl(color);
    return [`HEX: ${hex}`, `RGB: rgb(${color.r}, ${color.g}, ${color.b})`, `RGBA: rgba(${color.r}, ${color.g}, ${color.b}, ${trimNumber(color.a)})`, `HSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`].join('\n');
}

export function contrastReport(foreground: string, background: string): string {
    const fg = parseColor(foreground);
    const bg = parseColor(background);
    const ratio = contrastRatio(fg, bg);
    const rounded = Math.round(ratio * 100) / 100;
    const line = (label: string, pass: boolean) => `${label}: ${pass ? 'pass' : 'fail'}`;
    return [
        `Contrast ratio: ${rounded}:1`,
        line('AA normal text (4.5:1)', ratio >= 4.5),
        line('AA large text (3:1)', ratio >= 3),
        line('AAA normal text (7:1)', ratio >= 7),
        line('AAA large text (4.5:1)', ratio >= 4.5),
        line('UI components (3:1)', ratio >= 3),
    ].join('\n');
}

export function convertCase(value: string): string {
    const words = splitWords(value);
    const joined = words.join(' ');
    return [
        `lower: ${joined.toLowerCase()}`,
        `UPPER: ${joined.toUpperCase()}`,
        `Title: ${words.map(capitalize).join(' ')}`,
        `Sentence: ${joined ? capitalize(joined) : ''}`,
        `camelCase: ${words.map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word))).join('')}`,
        `PascalCase: ${words.map(capitalize).join('')}`,
        `snake_case: ${words.join('_')}`,
        `SCREAMING_SNAKE: ${words.join('_').toUpperCase()}`,
        `kebab-case: ${words.join('-')}`,
    ].join('\n');
}

export function slugify(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

export function explainCron(expression: string, from = new Date(), count = 5, zone: CronZone = 'local'): { description: string; next: string[] } {
    const parsed = parseCron(expression);
    const next: string[] = [];
    let cursor = advanceCron(from, parsed.hasSeconds, zone);
    let guard = 0;
    const limit = parsed.hasSeconds ? 172800 : 527040;
    while (next.length < count && guard < limit) {
        if (cronMatches(cursor, parsed, zone)) {
            next.push(zone === 'utc' ? cursor.toISOString() : formatLocal(cursor));
        }
        cursor = advanceCron(cursor, parsed.hasSeconds, zone);
        guard += 1;
    }
    if (next.length === 0) {
        throw new Error('No matching time was found in the search window.');
    }
    return { description: describeCron(parsed), next };
}

export function chmodReport(value: string): string {
    const text = requireText(value, 'Mode').trim();
    if (/^[0-7]{3,4}$/.test(text)) {
        return formatMode(text.padStart(4, '0'));
    }
    if (/^[dl-][r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(text)) {
        return formatMode(symbolicToOctal(text.slice(-9)));
    }
    if (/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(text)) {
        return formatMode(symbolicToOctal(text));
    }
    if (/[=,]/.test(text) && !/[+-]/.test(text)) {
        return formatMode(absoluteSymbolicToOctal(text));
    }
    throw new Error('Use octal (755), symbolic (rwxr-xr-x), or absolute assignments (u=rwx,g=rx,o=r).');
}

export function subnetReport(value: string): string {
    const text = requireText(value, 'Network').trim();
    const [address, prefixText] = text.split('/');
    const ip = parseIPv4(address);
    if (prefixText === undefined) {
        return [`Address: ${formatIPv4(ip)}`, `Decimal: ${ip}`, `Hex: 0x${ip.toString(16).padStart(8, '0')}`].join('\n');
    }
    if (!/^\d{1,2}$/.test(prefixText)) {
        throw new Error('CIDR prefix must be an integer from 0 to 32.');
    }
    const prefix = Number(prefixText);
    if (prefix > 32) {
        throw new Error('CIDR prefix must be an integer from 0 to 32.');
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (ip & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = 2 ** (32 - prefix);
    const usable = prefix >= 31 ? total : Math.max(total - 2, 0);
    const first = prefix >= 31 ? network : (network + 1) >>> 0;
    const last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
    return [
        `Address: ${formatIPv4(ip)}/${prefix}`,
        `Netmask: ${formatIPv4(mask)}`,
        `Wildcard: ${formatIPv4((~mask) >>> 0)}`,
        `Network: ${formatIPv4(network)}`,
        `Broadcast: ${formatIPv4(broadcast)}`,
        `First: ${formatIPv4(first)}`,
        `Last: ${formatIPv4(last)}`,
        `Total addresses: ${total}`,
        `Usable hosts: ${usable}`,
        `Decimal: ${ip}`,
    ].join('\n');
}

export function generateUla(subnet: number): string {
    const bytes = crypto.randomBytes(5);
    const hex = `fd${Buffer.from(bytes).toString('hex')}`;
    const groups = hex.match(/.{4}/g) ?? [];
    const subnetHex = subnet.toString(16).padStart(4, '0');
    return `${groups.join(':')}:${subnetHex}::/64\nPrefix: ${groups.join(':')}::/48`;
}

export function formatMac(value: string, style: string, letterCase: string): string {
    const hex = requireText(value, 'MAC').replace(/[^0-9a-fA-F]/g, '');
    if (hex.length !== 12) {
        throw new Error('MAC address must contain 12 hex digits.');
    }
    const pairs = hex.match(/.{2}/g) ?? [];
    let formatted = pairs.join(':');
    if (style === 'hyphen') {
        formatted = pairs.join('-');
    } else if (style === 'dot') {
        formatted = hex.replace(/(.{4})/g, '$1.').replace(/\.$/, '');
    } else if (style === 'plain') {
        formatted = hex;
    }
    return letterCase === 'lower' ? formatted.toLowerCase() : formatted.toUpperCase();
}

export function compareSemver(left: string, right: string): number {
    return compareVersions(parseSemver(left), parseSemver(right));
}

export function bumpSemver(value: string, part: string): string {
    const version = parseSemver(value);
    if (part === 'major') {
        return `${version.major + 1}.0.0`;
    }
    if (part === 'minor') {
        return `${version.major}.${version.minor + 1}.0`;
    }
    return `${version.major}.${version.minor}.${version.patch + 1}`;
}

export function satisfiesSemver(versionText: string, rangeText: string): boolean {
    const version = parseSemver(versionText);
    const alternatives = rangeText.split('||').map((part) => part.trim()).filter(Boolean);
    if (alternatives.length === 0) {
        throw new Error('Range is required.');
    }
    return alternatives.some((alternative) => alternative.split(/\s+/).every((comparator) => matchesComparator(version, comparator)));
}

export function convertCssUnits(value: string, base: number, direction: string): string {
    const numbers = value.split(/[\s,]+/).filter(Boolean).map((item) => readNumber(item, 'Value', -100000, 100000));
    return numbers
        .map((item) => (direction === 'rem-to-px' ? `${trimNumber(item * base)}px` : `${trimNumber(item / base)}rem`))
        .join('\n');
}

export function aspectRatio(width: number, height: number): string {
    const divisor = gcd(Math.round(width * 1000), Math.round(height * 1000));
    const left = Math.round(width * 1000) / divisor;
    const right = Math.round(height * 1000) / divisor;
    return `${trimNumber(width)}:${trimNumber(height)}\nSimplified: ${trimNumber(left)}:${trimNumber(right)}\nScale: ${trimNumber(width / height)}`;
}

export function convertBytes(value: number, unit: string): string {
    const factors: Record<string, number> = {
        B: 1,
        KB: 1000,
        MB: 1000 ** 2,
        GB: 1000 ** 3,
        TB: 1000 ** 4,
        KiB: 1024,
        MiB: 1024 ** 2,
        GiB: 1024 ** 3,
        TiB: 1024 ** 4,
    };
    const bytes = value * factors[unit];
    return Object.entries(factors)
        .map(([name, factor]) => `${name.padEnd(4, ' ')} ${trimNumber(bytes / factor)}`)
        .join('\n');
}

export function toRoman(value: number): string {
    if (value < 1 || value > 3999) {
        throw new Error('Roman numerals here cover 1 through 3999.');
    }
    const table: Array<[number, string]> = [
        [1000, 'M'],
        [900, 'CM'],
        [500, 'D'],
        [400, 'CD'],
        [100, 'C'],
        [90, 'XC'],
        [50, 'L'],
        [40, 'XL'],
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I'],
    ];
    let remaining = value;
    let output = '';
    for (const [amount, glyph] of table) {
        while (remaining >= amount) {
            output += glyph;
            remaining -= amount;
        }
    }
    return output;
}

export function fromRoman(value: string): number {
    const text = value.trim().toUpperCase();
    if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(text) || !text) {
        throw new Error('Input is not a Roman numeral.');
    }
    const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let index = 0; index < text.length; index += 1) {
        const current = values[text[index]];
        const next = values[text[index + 1]] ?? 0;
        total += current < next ? -current : current;
    }
    return total;
}

function parseDate(value: string): Date {
    if (/^-?\d+$/.test(value)) {
        const numeric = Number(value);
        const millis = Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric;
        const date = new Date(millis);
        if (Number.isNaN(date.getTime())) {
            throw new Error('Invalid timestamp.');
        }
        return date;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Could not parse that date.');
    }
    return date;
}

function formatLocal(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatRelative(delta: number): string {
    const seconds = Math.round(Math.abs(delta) / 1000);
    const units: Array<[number, string]> = [
        [86400, 'day'],
        [3600, 'hour'],
        [60, 'minute'],
        [1, 'second'],
    ];
    const [size, label] = units.find(([unit]) => seconds >= unit) ?? [1, 'second'];
    const amount = Math.floor(seconds / size);
    const noun = `${amount} ${label}${amount === 1 ? '' : 's'}`;
    if (seconds === 0) {
        return 'now';
    }
    return delta >= 0 ? `in ${noun}` : `${noun} ago`;
}

function formatBigInt(value: bigint, base: number): string {
    if (value === 0n) {
        return '0';
    }
    const negative = value < 0n;
    let current = negative ? -value : value;
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    let output = '';
    const radix = BigInt(base);
    while (current > 0n) {
        output = alphabet[Number(current % radix)] + output;
        current /= radix;
    }
    return negative ? `-${output}` : output;
}

function parseColor(value: string): Rgba {
    const text = value.trim().toLowerCase();
    if (text === 'transparent') {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    if (NAMED_COLORS[text]) {
        return parseColor(`#${NAMED_COLORS[text]}`);
    }
    const hex = text.match(/^#?([0-9a-f]{3,8})$/);
    if (hex) {
        const body = hex[1];
        const expand = (chunk: string) => Number.parseInt(chunk.length === 1 ? chunk + chunk : chunk, 16);
        if (body.length === 3 || body.length === 4) {
            return { r: expand(body[0]), g: expand(body[1]), b: expand(body[2]), a: body.length === 4 ? expand(body[3]) / 255 : 1 };
        }
        if (body.length === 6 || body.length === 8) {
            return {
                r: expand(body.slice(0, 2)),
                g: expand(body.slice(2, 4)),
                b: expand(body.slice(4, 6)),
                a: body.length === 8 ? expand(body.slice(6, 8)) / 255 : 1,
            };
        }
    }
    const rgb = text.match(/^rgba?\(([^)]+)\)$/);
    if (rgb) {
        const parts = rgb[1].split(/[\s,\/]+/).filter(Boolean);
        if (parts.length < 3) {
            throw new Error('RGB color needs three channels.');
        }
        return { r: colorChannel(parts[0]), g: colorChannel(parts[1]), b: colorChannel(parts[2]), a: parts[3] ? alphaChannel(parts[3]) : 1 };
    }
    const hsl = text.match(/^hsla?\(([^)]+)\)$/);
    if (hsl) {
        const parts = hsl[1].split(/[\s,\/]+/).filter(Boolean);
        if (parts.length < 3) {
            throw new Error('HSL color needs hue, saturation, and lightness.');
        }
        const rgbFromHsl = hslToRgb(Number(parts[0]), percent(parts[1]), percent(parts[2]));
        return { ...rgbFromHsl, a: parts[3] ? alphaChannel(parts[3]) : 1 };
    }
    throw new Error('Use hex, rgb(), hsl(), or a common CSS color name.');
}

function colorChannel(value: string): number {
    const amount = value.endsWith('%') ? (percent(value) / 100) * 255 : Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 255) {
        throw new Error('RGB channels must be between 0 and 255.');
    }
    return Math.round(amount);
}

function alphaChannel(value: string): number {
    const amount = value.endsWith('%') ? percent(value) / 100 : Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
        throw new Error('Alpha must be between 0 and 1.');
    }
    return amount;
}

function percent(value: string): number {
    return Number(value.replace('%', ''));
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const hue = ((h % 360) + 360) % 360;
    const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lightness - chroma / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) {
        r = chroma;
        g = x;
    } else if (hue < 120) {
        r = x;
        g = chroma;
    } else if (hue < 180) {
        g = chroma;
        b = x;
    } else if (hue < 240) {
        g = x;
        b = chroma;
    } else if (hue < 300) {
        r = x;
        b = chroma;
    } else {
        r = chroma;
        b = x;
    }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function rgbToHsl(color: Rgba): { h: number; s: number; l: number } {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (max === min) {
        return { h: 0, s: 0, l: Math.round(lightness * 100) };
    }
    const delta = max - min;
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let hue = 0;
    if (max === r) {
        hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
        hue = 60 * ((b - r) / delta + 2);
    } else {
        hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0) {
        hue += 360;
    }
    return { h: Math.round(hue), s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

function toHex(color: Rgba): string {
    const hex = [color.r, color.g, color.b].map((channel) => channel.toString(16).padStart(2, '0')).join('');
    return `#${hex}`;
}

function contrastRatio(foreground: Rgba, background: Rgba): number {
    const fg = composite(foreground, background);
    const lighter = Math.max(relativeLuminance(fg), relativeLuminance(background));
    const darker = Math.min(relativeLuminance(fg), relativeLuminance(background));
    return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground: Rgba, background: Rgba): Rgba {
    const alpha = foreground.a + background.a * (1 - foreground.a);
    const channel = (fg: number, bg: number) => (alpha === 0 ? 0 : Math.round((fg * foreground.a + bg * background.a * (1 - foreground.a)) / alpha));
    return { r: channel(foreground.r, background.r), g: channel(foreground.g, background.g), b: channel(foreground.b, background.b), a: alpha };
}

function relativeLuminance(color: Rgba): number {
    const channel = (value: number) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function splitWords(value: string): string[] {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\-.]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.toLowerCase());
}

function capitalize(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : value;
}

interface ParsedCron {
    hasSeconds: boolean;
    second: { expr: string; values: Set<number> };
    minute: { expr: string; values: Set<number> };
    hour: { expr: string; values: Set<number> };
    dom: { expr: string; values: Set<number>; star: boolean };
    month: { expr: string; values: Set<number> };
    dow: { expr: string; values: Set<number>; star: boolean };
}

function parseCron(expression: string): ParsedCron {
    const text = expression.trim();
    if (/[LW#]/.test(text)) {
        throw new Error('Quartz L, W, and # tokens are not supported.');
    }
    const fields = text.split(/\s+/);
    if (fields.length !== 5 && fields.length !== 6) {
        throw new Error('Cron expression must have 5 fields, or 6 when it starts with seconds.');
    }
    const hasSeconds = fields.length === 6;
    const [secondExpr, minuteExpr, hourExpr, domExpr, monthExpr, dowExpr] = hasSeconds ? fields : ['0', ...fields];
    return {
        hasSeconds,
        second: { expr: secondExpr, values: parseCronField(secondExpr, 0, 59) },
        minute: { expr: minuteExpr, values: parseCronField(minuteExpr, 0, 59) },
        hour: { expr: hourExpr, values: parseCronField(hourExpr, 0, 23) },
        dom: { expr: domExpr, values: parseCronField(domExpr, 1, 31), star: isStar(domExpr) },
        month: { expr: monthExpr, values: parseCronField(monthExpr, 1, 12, MONTHS) },
        dow: { expr: dowExpr, values: normalizeDow(parseCronField(dowExpr, 0, 7, WEEKDAYS)), star: isStar(dowExpr) },
    };
}

function isStar(value: string): boolean {
    return value === '*' || value === '?';
}

function parseCronField(expr: string, min: number, max: number, names?: string[]): Set<number> {
    const values = new Set<number>();
    for (const part of expr.split(',')) {
        if (!part) {
            throw new Error(`Invalid cron field ${expr}.`);
        }
        const [rangePart, stepText, extra] = part.split('/');
        if (extra !== undefined || rangePart === '') {
            throw new Error(`Invalid cron field ${expr}.`);
        }
        const step = stepText === undefined ? 1 : Number(stepText);
        if (!Number.isInteger(step) || step <= 0) {
            throw new Error(`Invalid step in ${expr}.`);
        }
        let start = min;
        let end = max;
        if (!isStar(rangePart)) {
            const [from, to, overflow] = rangePart.split('-');
            if (overflow !== undefined) {
                throw new Error(`Invalid range in ${expr}.`);
            }
            start = cronToken(from, min, max, names);
            end = to === undefined ? (stepText === undefined ? start : max) : cronToken(to, min, max, names);
        }
        if (start > end || start < min || end > max) {
            throw new Error(`Value out of range in ${expr}.`);
        }
        for (let value = start; value <= end; value += step) {
            values.add(value);
        }
    }
    return values;
}

function cronToken(token: string, min: number, max: number, names?: string[]): number {
    const named = names?.indexOf(token.toUpperCase()) ?? -1;
    const value = named >= 0 ? (names === WEEKDAYS ? named : named + 1) : Number(token);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Cron value ${token} is outside ${min}-${max}.`);
    }
    return value;
}

function normalizeDow(values: Set<number>): Set<number> {
    const normalized = new Set<number>();
    for (const value of values) {
        normalized.add(value === 7 ? 0 : value);
    }
    return normalized;
}

function cronMatches(date: Date, cron: ParsedCron, zone: CronZone): boolean {
    const parts = cronParts(date, zone);
    if (!cron.second.values.has(parts.second) || !cron.minute.values.has(parts.minute) || !cron.hour.values.has(parts.hour) || !cron.month.values.has(parts.month)) {
        return false;
    }
    const dom = cron.dom.values.has(parts.dom);
    const dow = cron.dow.values.has(parts.dow);
    if (!cron.dom.star && !cron.dow.star) {
        return dom || dow;
    }
    return dom && dow;
}

function cronParts(date: Date, zone: CronZone): CronParts {
    if (zone === 'utc') {
        return {
            second: date.getUTCSeconds(),
            minute: date.getUTCMinutes(),
            hour: date.getUTCHours(),
            dom: date.getUTCDate(),
            month: date.getUTCMonth() + 1,
            dow: date.getUTCDay(),
        };
    }
    return {
        second: date.getSeconds(),
        minute: date.getMinutes(),
        hour: date.getHours(),
        dom: date.getDate(),
        month: date.getMonth() + 1,
        dow: date.getDay(),
    };
}

function advanceCron(date: Date, hasSeconds: boolean, zone: CronZone): Date {
    const next = new Date(date.getTime());
    if (zone === 'utc') {
        next.setUTCMilliseconds(0);
        if (hasSeconds) {
            next.setUTCSeconds(next.getUTCSeconds() + 1);
        } else {
            next.setUTCSeconds(0);
            next.setUTCMinutes(next.getUTCMinutes() + 1);
        }
        return next;
    }
    next.setMilliseconds(0);
    if (hasSeconds) {
        next.setSeconds(next.getSeconds() + 1);
    } else {
        next.setSeconds(0);
        next.setMinutes(next.getMinutes() + 1);
    }
    return next;
}

function describeCron(cron: ParsedCron): string {
    const minute = cron.minute.expr === '*' ? 'every minute' : `minute ${cron.minute.expr}`;
    const hour = cron.hour.expr === '*' ? 'of every hour' : `during hour ${cron.hour.expr}`;
    const month = cron.month.expr === '*' ? 'of every month' : `in month ${cron.month.expr}`;
    const day = cron.dom.star && cron.dow.star ? 'on every day' : `on day-of-month ${cron.dom.expr} and weekday ${cron.dow.expr}`;
    const second = cron.hasSeconds ? `at second ${cron.second.expr}, ` : '';
    return `${second}${minute} ${hour}, ${day}, ${month}. When both day-of-month and weekday are restricted, either one can match.`;
}

function formatMode(octal: string): string {
    const special = Number(octal[0]);
    const digits = octal.slice(1).split('').map(Number);
    const symbols = digits.map((digit) => `${digit & 4 ? 'r' : '-'}${digit & 2 ? 'w' : '-'}${digit & 1 ? 'x' : '-'}`).join('');
    const chars = symbols.split('');
    if (special & 4) {
        chars[2] = chars[2] === 'x' ? 's' : 'S';
    }
    if (special & 2) {
        chars[5] = chars[5] === 'x' ? 's' : 'S';
    }
    if (special & 1) {
        chars[8] = chars[8] === 'x' ? 't' : 'T';
    }
    return [`Octal: ${octal.replace(/^0(?=\d{3}$)/, '')}`, `Symbolic: ${chars.join('')}`, `Owner: ${chars.slice(0, 3).join('')}`, `Group: ${chars.slice(3, 6).join('')}`, `Other: ${chars.slice(6).join('')}`].join('\n');
}

function symbolicToOctal(symbolic: string): string {
    const chunks = [symbolic.slice(0, 3), symbolic.slice(3, 6), symbolic.slice(6, 9)];
    let special = 0;
    const digits = chunks.map((chunk, index) => {
        let digit = 0;
        if (chunk[0] === 'r') {
            digit |= 4;
        }
        if (chunk[1] === 'w') {
            digit |= 2;
        }
        if (chunk[2] === 'x' || chunk[2] === 's' || chunk[2] === 't') {
            digit |= 1;
        }
        if (chunk[2] === 's' || chunk[2] === 'S') {
            special |= index === 0 ? 4 : 2;
        }
        if (chunk[2] === 't' || chunk[2] === 'T') {
            special |= 1;
        }
        return String(digit);
    });
    return `${special}${digits.join('')}`;
}

function absoluteSymbolicToOctal(value: string): string {
    const mode = [0, 0, 0];
    for (const clause of value.split(',')) {
        const [who, perms] = clause.split('=');
        if (!who || perms === undefined || !/^[ugoa]+$/.test(who) || !/^[rwx]*$/.test(perms)) {
            throw new Error('Assignments look like u=rwx,g=rx,o=r.');
        }
        let digit = 0;
        if (perms.includes('r')) {
            digit |= 4;
        }
        if (perms.includes('w')) {
            digit |= 2;
        }
        if (perms.includes('x')) {
            digit |= 1;
        }
        const classes = who === 'a' ? ['u', 'g', 'o'] : who.split('');
        for (const item of classes) {
            mode[item === 'u' ? 0 : item === 'g' ? 1 : 2] = digit;
        }
    }
    return `0${mode.join('')}`;
}

function parseIPv4(value: string): number {
    const parts = value.split('.');
    if (parts.length !== 4) {
        throw new Error('IPv4 address must have four octets.');
    }
    let address = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part) || Number(part) > 255) {
            throw new Error('Invalid IPv4 octet.');
        }
        address = ((address << 8) | Number(part)) >>> 0;
    }
    return address;
}

function formatIPv4(value: number): string {
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;

function parseSemver(value: string): SemVer {
    const match = value.trim().match(SEMVER);
    if (!match) {
        throw new Error(`Invalid semantic version: ${value}`);
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split('.') : [],
    };
}

function compareVersions(left: SemVer, right: SemVer): number {
    const numeric = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
    if (numeric !== 0) {
        return numeric;
    }
    if (left.prerelease.length === 0 && right.prerelease.length === 0) {
        return 0;
    }
    if (left.prerelease.length === 0) {
        return 1;
    }
    if (right.prerelease.length === 0) {
        return -1;
    }
    const length = Math.max(left.prerelease.length, right.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const a = left.prerelease[index];
        const b = right.prerelease[index];
        if (a === undefined) {
            return -1;
        }
        if (b === undefined) {
            return 1;
        }
        const aNumber = /^\d+$/.test(a);
        const bNumber = /^\d+$/.test(b);
        if (aNumber && bNumber && a !== b) {
            return Number(a) - Number(b);
        }
        if (aNumber !== bNumber) {
            return aNumber ? -1 : 1;
        }
        if (a !== b) {
            return a < b ? -1 : 1;
        }
    }
    return 0;
}

function matchesComparator(version: SemVer, comparator: string): boolean {
    if (comparator === '*' || comparator === 'x' || comparator === 'X') {
        return version.prerelease.length === 0;
    }
    const operatorMatch = comparator.match(/^(<=|>=|<|>|=|\^|~)?(.+)$/);
    if (!operatorMatch) {
        throw new Error(`Invalid comparator ${comparator}.`);
    }
    const operator = operatorMatch[1] ?? '=';
    const body = operatorMatch[2];
    if (/x|\*/i.test(body)) {
        return matchesWildcard(version, body);
    }
    const target = parseSemver(body);
    const comparison = compareVersions(version, target);
    if (operator === '=') {
        return comparison === 0;
    }
    if (operator === '<') {
        return comparison < 0 && samePrereleasePolicy(version, target);
    }
    if (operator === '>') {
        return comparison > 0 && samePrereleasePolicy(version, target);
    }
    if (operator === '<=') {
        return comparison <= 0 && samePrereleasePolicy(version, target);
    }
    if (operator === '>=') {
        return comparison >= 0 && samePrereleasePolicy(version, target);
    }
    if (operator === '~') {
        const upper = { major: target.major, minor: target.minor + 1, patch: 0, prerelease: [] };
        return compareVersions(version, target) >= 0 && compareVersions(version, upper) < 0 && samePrereleasePolicy(version, target);
    }
    const upper = target.major === 0 ? { major: 0, minor: target.minor + 1, patch: 0, prerelease: [] } : { major: target.major + 1, minor: 0, patch: 0, prerelease: [] };
    return compareVersions(version, target) >= 0 && compareVersions(version, upper) < 0 && samePrereleasePolicy(version, target);
}

function samePrereleasePolicy(version: SemVer, target: SemVer): boolean {
    if (version.prerelease.length === 0) {
        return true;
    }
    return target.prerelease.length > 0 && version.major === target.major && version.minor === target.minor && version.patch === target.patch;
}

function matchesWildcard(version: SemVer, body: string): boolean {
    if (version.prerelease.length > 0) {
        return false;
    }
    const parts = body.split('.');
    const major = parts[0];
    const minor = parts[1] ?? 'x';
    const patch = parts[2] ?? 'x';
    if (major !== 'x' && major !== '*' && version.major !== Number(major)) {
        return false;
    }
    if (minor !== 'x' && minor !== '*' && version.minor !== Number(minor)) {
        return false;
    }
    return patch === 'x' || patch === '*' || version.patch === Number(patch);
}

function trimNumber(value: number): string {
    return Number(value.toFixed(6)).toString();
}

function gcd(left: number, right: number): number {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b) {
        [a, b] = [b, a % b];
    }
    return a || 1;
}

function cronResult(values: Record<string, string>): UtilityResult {
    const explained = explainCron(requireText(values.expression, 'Expression'), new Date(), readInteger(values.count, 'Count', 1, 20), 'local');
    return { output: `${explained.description}\n\nNext runs (local):\n${explained.next.join('\n')}` };
}

export const convertTools: UtilityTool[] = [
    {
        id: 'timestamp',
        label: 'Timestamp Converter',
        description: 'Convert Unix time and ISO dates',
        command: 'devx.timestampTool',
        icon: 'timestamp.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Convert now, Unix seconds, Unix milliseconds, or a date string into ISO, UTC, local, and relative forms.',
        fields: [{ id: 'input', label: 'Timestamp or date', kind: 'text', placeholder: 'now' }],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({ output: formatTimestamp(values.input ?? '') }),
    },
    {
        id: 'number-base',
        label: 'Number Base',
        description: 'Convert between bases 2 through 36',
        command: 'devx.numberBaseTool',
        icon: 'number-base.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Convert integers between bases 2 through 36. Prefixes such as 0x are not assumed; choose the source base.',
        fields: [
            { id: 'value', label: 'Value', kind: 'text', placeholder: 'ff' },
            { id: 'from', label: 'From base', kind: 'number', defaultValue: '16' },
            { id: 'to', label: 'To base', kind: 'number', defaultValue: '10' },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({
            output: convertBase(values.value ?? '', readInteger(values.from, 'From base', 2, 36), readInteger(values.to, 'To base', 2, 36)),
        }),
    },
    {
        id: 'color',
        label: 'Color Converter',
        description: 'Convert hex, RGB, and HSL',
        command: 'devx.colorTool',
        icon: 'color.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Convert hex, rgb(), hsl(), and common CSS color names.',
        fields: [{ id: 'input', label: 'Color', kind: 'text', placeholder: '#c586c0' }],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({ output: convertColor(requireText(values.input, 'Color')) }),
    },
    {
        id: 'contrast',
        label: 'Contrast Checker',
        description: 'Check WCAG contrast for two colors',
        command: 'devx.contrastTool',
        icon: 'contrast.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Relative luminance and WCAG 2 contrast for normal text, large text, and UI components.',
        fields: [
            { id: 'foreground', label: 'Foreground', kind: 'text', defaultValue: '#111111' },
            { id: 'background', label: 'Background', kind: 'text', defaultValue: '#ffffff' },
        ],
        actions: [{ id: 'check', label: 'Check' }],
        run: (_action, values) => ({ output: contrastReport(requireText(values.foreground, 'Foreground'), requireText(values.background, 'Background')) }),
    },
    {
        id: 'case',
        label: 'Case Converter',
        description: 'Convert identifier and prose casing',
        command: 'devx.caseTool',
        icon: 'case.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Split on spaces, punctuation, and camelCase boundaries, then show the common casings together.',
        fields: [{ id: 'input', label: 'Text', kind: 'textarea', rows: 5, placeholder: 'hello world' }],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({ output: convertCase(requireText(values.input, 'Text')) }),
    },
    {
        id: 'slug',
        label: 'Slug Generator',
        description: 'Make a URL slug',
        command: 'devx.slugTool',
        icon: 'slug.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Lowercase ASCII slug with accents stripped and punctuation collapsed to hyphens.',
        fields: [{ id: 'input', label: 'Text', kind: 'text', placeholder: 'Hello, World!' }],
        actions: [{ id: 'slug', label: 'Slugify' }],
        run: (_action, values) => ({ output: slugify(requireText(values.input, 'Text')) }),
    },
    {
        id: 'cron',
        label: 'Cron Parser',
        description: 'Describe a cron expression and list next runs',
        command: 'devx.cronTool',
        icon: 'cron.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Standard 5-field cron, plus an optional leading seconds field. Names such as MON and JAN are accepted. Quartz L, W, and # are rejected.',
        fields: [
            { id: 'expression', label: 'Expression', kind: 'text', placeholder: '*/15 9-17 * * 1-5' },
            { id: 'count', label: 'Next runs', kind: 'number', defaultValue: '5' },
        ],
        actions: [{ id: 'explain', label: 'Explain' }],
        run: (_action, values) => cronResult(values),
    },
    {
        id: 'chmod',
        label: 'Chmod Calculator',
        description: 'Convert octal and symbolic permissions',
        command: 'devx.chmodTool',
        icon: 'chmod.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Convert 755, rwxr-xr-x, or u=rwx,g=rx,o=r. Setuid, setgid, and sticky bits are included for octal and symbolic forms.',
        fields: [{ id: 'mode', label: 'Mode', kind: 'text', placeholder: '755' }],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({ output: chmodReport(values.mode ?? '') }),
    },
    {
        id: 'subnet',
        label: 'IPv4 Subnet',
        description: 'Calculate CIDR, mask, and host range',
        command: 'devx.subnetTool',
        icon: 'subnet.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Inspect an IPv4 CIDR block or convert a single address to decimal and hex. /31 and /32 follow the point-to-point usable-host rules.',
        fields: [{ id: 'input', label: 'Address or CIDR', kind: 'text', placeholder: '192.168.1.10/24' }],
        actions: [{ id: 'calculate', label: 'Calculate' }],
        run: (_action, values) => ({ output: subnetReport(values.input ?? '') }),
    },
    {
        id: 'ipv6-ula',
        label: 'IPv6 ULA',
        description: 'Generate a local IPv6 unique-local prefix',
        command: 'devx.ipv6UlaTool',
        icon: 'ipv6.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'RFC 4193 style fd00::/8 prefix with 40 random bits. This is a local prefix, not a globally routed allocation.',
        fields: [{ id: 'subnet', label: 'Subnet ID', kind: 'number', defaultValue: '0' }],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({ output: generateUla(readInteger(values.subnet, 'Subnet ID', 0, 65535)) }),
    },
    {
        id: 'mac',
        label: 'MAC Address',
        description: 'Normalize MAC address formatting',
        command: 'devx.macTool',
        icon: 'mac.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Reformat 12 hex digits as colon, hyphen, Cisco dot, or plain text.',
        fields: [
            { id: 'input', label: 'MAC address', kind: 'text', placeholder: 'aa-bb-cc-dd-ee-ff' },
            {
                id: 'style',
                label: 'Style',
                kind: 'select',
                options: [
                    { value: 'colon', label: 'Colon' },
                    { value: 'hyphen', label: 'Hyphen' },
                    { value: 'dot', label: 'Cisco dot' },
                    { value: 'plain', label: 'Plain' },
                ],
                defaultValue: 'colon',
            },
            {
                id: 'case',
                label: 'Case',
                kind: 'select',
                options: [
                    { value: 'upper', label: 'Upper' },
                    { value: 'lower', label: 'Lower' },
                ],
                defaultValue: 'upper',
            },
        ],
        actions: [{ id: 'format', label: 'Format' }],
        run: (_action, values) => ({
            output: formatMac(values.input ?? '', choice(values.style, 'style', ['colon', 'hyphen', 'dot', 'plain'], 'colon'), choice(values.case, 'case', ['upper', 'lower'], 'upper')),
        }),
    },
    {
        id: 'semver',
        label: 'SemVer Calculator',
        description: 'Compare, bump, and test semantic versions',
        command: 'devx.semverTool',
        icon: 'semver.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Compare versions, bump major/minor/patch, or test ranges with =, >, >=, <, <=, ^, ~, x, and ||.',
        fields: [
            { id: 'left', label: 'Version', kind: 'text', placeholder: '1.2.3' },
            { id: 'right', label: 'Other version or range', kind: 'text', placeholder: '^1.2.0' },
            {
                id: 'part',
                label: 'Bump',
                kind: 'select',
                options: [
                    { value: 'patch', label: 'Patch' },
                    { value: 'minor', label: 'Minor' },
                    { value: 'major', label: 'Major' },
                ],
                defaultValue: 'patch',
            },
        ],
        actions: [
            { id: 'compare', label: 'Compare' },
            { id: 'satisfies', label: 'Satisfies range' },
            { id: 'bump', label: 'Bump' },
        ],
        run: (action, values) => {
            if (action === 'bump') {
                return { output: bumpSemver(requireText(values.left, 'Version'), choice(values.part, 'bump', ['major', 'minor', 'patch'], 'patch')) };
            }
            if (action === 'satisfies') {
                const ok = satisfiesSemver(requireText(values.left, 'Version'), requireText(values.right, 'Range'));
                return { output: ok ? 'Satisfies' : 'Does not satisfy' };
            }
            const comparison = compareSemver(requireText(values.left, 'Version'), requireText(values.right, 'Other version'));
            return { output: comparison === 0 ? 'Equal' : comparison < 0 ? 'Less' : 'Greater' };
        },
    },
    {
        id: 'css-units',
        label: 'CSS Units',
        description: 'Convert px and rem, or simplify an aspect ratio',
        command: 'devx.cssUnitsTool',
        icon: 'css-units.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Convert pixel and rem values with a configurable root size, or reduce a width and height to an aspect ratio.',
        fields: [
            { id: 'value', label: 'Values', kind: 'text', placeholder: '16 32' },
            { id: 'base', label: 'Root px', kind: 'number', defaultValue: '16' },
            { id: 'width', label: 'Width', kind: 'text', defaultValue: '16' },
            { id: 'height', label: 'Height', kind: 'text', defaultValue: '9' },
            {
                id: 'direction',
                label: 'Direction',
                kind: 'select',
                options: [
                    { value: 'px-to-rem', label: 'px to rem' },
                    { value: 'rem-to-px', label: 'rem to px' },
                ],
                defaultValue: 'px-to-rem',
            },
        ],
        actions: [
            { id: 'convert', label: 'Convert units' },
            { id: 'aspect', label: 'Aspect ratio' },
        ],
        run: (action, values) => {
            if (action === 'aspect') {
                return { output: aspectRatio(readNumber(values.width, 'Width', 0.001, 100000), readNumber(values.height, 'Height', 0.001, 100000)) };
            }
            return {
                output: convertCssUnits(
                    requireText(values.value, 'Values'),
                    readNumber(values.base, 'Root px', 1, 1000),
                    choice(values.direction, 'direction', ['px-to-rem', 'rem-to-px'], 'px-to-rem'),
                ),
            };
        },
    },
    {
        id: 'bytes',
        label: 'Byte Units',
        description: 'Convert decimal and binary byte units',
        command: 'devx.byteUnitsTool',
        icon: 'bytes.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Show the same size in B, KB, MB, GB, TB, KiB, MiB, GiB, and TiB.',
        fields: [
            { id: 'value', label: 'Amount', kind: 'text', defaultValue: '1' },
            {
                id: 'unit',
                label: 'Unit',
                kind: 'select',
                options: ['B', 'KB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB', 'TiB'].map((unit) => ({ value: unit, label: unit })),
                defaultValue: 'MiB',
            },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({
            output: convertBytes(readNumber(values.value, 'Amount', 0, 1e15), choice(values.unit, 'unit', ['B', 'KB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB', 'TiB'], 'MiB')),
        }),
    },
    {
        id: 'roman',
        label: 'Roman Numerals',
        description: 'Convert integers and Roman numerals',
        command: 'devx.romanTool',
        icon: 'roman.svg',
        defaultVisible: true,
        category: 'Convert',
        summary: 'Convert integers from 1 to 3999 and standard Roman numerals.',
        fields: [{ id: 'input', label: 'Number or numeral', kind: 'text', placeholder: '2026' }],
        actions: [
            { id: 'to-roman', label: 'To Roman' },
            { id: 'from-roman', label: 'From Roman' },
        ],
        run: (action, values) => {
            const input = requireText(values.input, 'Value');
            if (action === 'from-roman') {
                return { output: String(fromRoman(input)) };
            }
            return { output: toRoman(readInteger(input, 'Value', 1, 3999)) };
        },
    },
];
