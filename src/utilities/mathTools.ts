import { linesOf, readNumber, requireText } from './common';
import type { UtilityTool } from './types';

// ── Math evaluator ───────────────────────────────────────────────────────────

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log10,
    log10: Math.log10,
    log2: Math.log2,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    sign: Math.sign,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    hypot: Math.hypot,
    deg: (value) => (value * 180) / Math.PI,
    rad: (value) => (value * Math.PI) / 180,
    fact: factorial,
    gcd: (a, b) => gcd(a, b),
    lcm: (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b)),
    avg: (...values) => values.reduce((sum, value) => sum + value, 0) / values.length,
    sum: (...values) => values.reduce((total, value) => total + value, 0),
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

function factorial(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > 170) {
        throw new Error('fact() needs an integer between 0 and 170.');
    }
    let result = 1;
    for (let index = 2; index <= value; index += 1) {
        result *= index;
    }
    return result;
}

function gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        [x, y] = [y, x % y];
    }
    return x;
}

type Token = { type: 'num'; value: number } | { type: 'id'; value: string } | { type: 'op'; value: string };

function tokenizeMath(input: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    while (index < input.length) {
        const char = input[index];
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }
        const rest = input.slice(index);
        const radix = /^0([xob])([0-9a-f_]+)/i.exec(rest);
        if (radix) {
            const base = { x: 16, o: 8, b: 2 }[radix[1].toLowerCase() as 'x' | 'o' | 'b'];
            const digits = radix[2].replace(/_/g, '');
            const value = parseInt(digits, base);
            if (Number.isNaN(value) || !new RegExp(`^[${'0123456789abcdef'.slice(0, base)}]+$`, 'i').test(digits)) {
                throw new Error(`Invalid number ${radix[0]}.`);
            }
            tokens.push({ type: 'num', value });
            index += radix[0].length;
            continue;
        }
        const number = /^(\d[\d_]*\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
        if (number) {
            tokens.push({ type: 'num', value: Number(number[0].replace(/_/g, '')) });
            index += number[0].length;
            continue;
        }
        const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
        if (id) {
            tokens.push({ type: 'id', value: id[0] });
            index += id[0].length;
            continue;
        }
        const op = /^(\*\*|<<|>>|[-+*/%^(),=!&|~])/.exec(rest);
        if (op) {
            tokens.push({ type: 'op', value: op[0] });
            index += op[0].length;
            continue;
        }
        throw new Error(`Unexpected character "${char}".`);
    }
    return tokens;
}

function shiftAmount(value: number): bigint {
    if (!Number.isInteger(value) || value < 0 || value > 1024) {
        throw new Error('Shift amount must be an integer between 0 and 1024.');
    }
    return BigInt(value);
}

class MathParser {
    private position = 0;

    constructor(
        private readonly tokens: Token[],
        private readonly variables: Record<string, number>,
    ) {}

    parse(): number {
        const value = this.bitOr();
        if (this.position < this.tokens.length) {
            throw new Error(`Unexpected "${String(this.tokens[this.position].value)}".`);
        }
        return value;
    }

    private peek(value: string): boolean {
        const token = this.tokens[this.position];
        return token?.type === 'op' && token.value === value;
    }

    private eat(value: string): boolean {
        if (this.peek(value)) {
            this.position += 1;
            return true;
        }
        return false;
    }

    private bitOr(): number {
        let left = this.bitAnd();
        while (this.eat('|')) {
            left = Number(BigInt(Math.trunc(left)) | BigInt(Math.trunc(this.bitAnd())));
        }
        return left;
    }

    private bitAnd(): number {
        let left = this.shift();
        while (this.eat('&')) {
            left = Number(BigInt(Math.trunc(left)) & BigInt(Math.trunc(this.shift())));
        }
        return left;
    }

    private shift(): number {
        let left = this.additive();
        for (;;) {
            if (this.eat('<<')) {
                left = Number(BigInt(Math.trunc(left)) << shiftAmount(this.additive()));
            } else if (this.eat('>>')) {
                left = Number(BigInt(Math.trunc(left)) >> shiftAmount(this.additive()));
            } else {
                return left;
            }
        }
    }

    private additive(): number {
        let left = this.multiplicative();
        for (;;) {
            if (this.eat('+')) {
                left += this.multiplicative();
            } else if (this.eat('-')) {
                left -= this.multiplicative();
            } else {
                return left;
            }
        }
    }

    private multiplicative(): number {
        let left = this.unary();
        for (;;) {
            if (this.eat('*')) {
                left *= this.unary();
            } else if (this.eat('/')) {
                left /= this.unary();
            } else if (this.eat('%')) {
                left %= this.unary();
            } else if (this.startsOperand()) {
                // Implicit multiplication: 2pi, 3(4+1), 2 sqrt(9)
                left *= this.unary();
            } else {
                return left;
            }
        }
    }

    private startsOperand(): boolean {
        const token = this.tokens[this.position];
        if (!token) {
            return false;
        }
        return token.type === 'id' || (token.type === 'op' && token.value === '(');
    }

    private unary(): number {
        if (this.eat('-')) {
            return -this.unary();
        }
        if (this.eat('+')) {
            return this.unary();
        }
        if (this.eat('~')) {
            return Number(~BigInt(Math.trunc(this.unary())));
        }
        return this.power();
    }

    private power(): number {
        const base = this.postfix();
        if (this.eat('^') || this.eat('**')) {
            return Math.pow(base, this.unary());
        }
        return base;
    }

    private postfix(): number {
        let value = this.primary();
        while (this.eat('!')) {
            value = factorial(value);
        }
        return value;
    }

    private primary(): number {
        const token = this.tokens[this.position];
        if (!token) {
            throw new Error('Unexpected end of expression.');
        }
        this.position += 1;
        if (token.type === 'num') {
            return token.value;
        }
        if (token.type === 'id') {
            const name = token.value;
            if (this.eat('(')) {
                const fn = FUNCTIONS[name.toLowerCase()];
                if (!fn) {
                    throw new Error(`Unknown function ${name}().`);
                }
                const args: number[] = [];
                if (!this.eat(')')) {
                    do {
                        args.push(this.bitOr());
                    } while (this.eat(','));
                    if (!this.eat(')')) {
                        throw new Error('Missing ")".');
                    }
                }
                return fn(...args);
            }
            if (name in this.variables) {
                return this.variables[name];
            }
            const constant = CONSTANTS[name.toLowerCase()];
            if (constant !== undefined) {
                return constant;
            }
            throw new Error(`Unknown name "${name}".`);
        }
        if (token.value === '(') {
            const value = this.bitOr();
            if (!this.eat(')')) {
                throw new Error('Missing ")".');
            }
            return value;
        }
        throw new Error(`Unexpected "${token.value}".`);
    }
}

export function evaluateExpression(expression: string, variables: Record<string, number> = {}): number {
    const tokens = tokenizeMath(expression);
    if (tokens.length === 0) {
        throw new Error('Expression is empty.');
    }
    return new MathParser(tokens, variables).parse();
}

function formatNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    if (Number.isInteger(value)) {
        return value.toString();
    }
    return String(Number(value.toPrecision(15)));
}

export function evaluateScript(value: string): string {
    const variables: Record<string, number> = {};
    const out: string[] = [];
    for (const raw of linesOf(requireText(value, 'Expression'))) {
        const line = raw.replace(/(#|\/\/).*$/, '').trim();
        if (!line) {
            continue;
        }
        const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+)$/.exec(line);
        try {
            if (assignment) {
                const result = evaluateExpression(assignment[2], variables);
                variables[assignment[1]] = result;
                variables.ans = result;
                out.push(`${assignment[1]} = ${formatNumber(result)}`);
            } else {
                const result = evaluateExpression(line, variables);
                variables.ans = result;
                out.push(`${line} = ${formatNumber(result)}`);
            }
        } catch (error) {
            out.push(`${line} → error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const last = variables.ans;
    if (last !== undefined && Number.isInteger(last) && Math.abs(last) <= Number.MAX_SAFE_INTEGER && out.length) {
        out.push('', `hex: 0x${last.toString(16)}  bin: 0b${last.toString(2)}  oct: 0o${last.toString(8)}`);
    }
    return out.join('\n');
}

// ── Percentage ───────────────────────────────────────────────────────────────

export function percentageReport(a: number, b: number): string {
    const fmt = (value: number) =>
        Number.isFinite(value) ? formatNumber(Math.round(value * 1e10) / 1e10) : 'undefined';
    return [
        `${fmt(a)}% of ${fmt(b)} = ${fmt((a / 100) * b)}`,
        `${fmt(a)} is ${fmt((a / b) * 100)}% of ${fmt(b)}`,
        `Change from ${fmt(a)} to ${fmt(b)} = ${fmt(((b - a) / Math.abs(a)) * 100)}%`,
        `Difference between ${fmt(a)} and ${fmt(b)} = ${fmt((Math.abs(a - b) / ((a + b) / 2)) * 100)}%`,
        `${fmt(b)} increased by ${fmt(a)}% = ${fmt(b * (1 + a / 100))}`,
        `${fmt(b)} decreased by ${fmt(a)}% = ${fmt(b * (1 - a / 100))}`,
        `Ratio ${fmt(a)} : ${fmt(b)} = ${fmt(a / b)}`,
    ].join('\n');
}

// ── Unit converter ───────────────────────────────────────────────────────────

interface UnitDef {
    label: string;
    factor?: number;
    toBase?: (value: number) => number;
    fromBase?: (value: number) => number;
}

export const UNIT_CATEGORIES: Record<string, Record<string, UnitDef>> = {
    length: {
        nm: { label: 'nanometer', factor: 1e-9 },
        um: { label: 'micrometer', factor: 1e-6 },
        mm: { label: 'millimeter', factor: 1e-3 },
        cm: { label: 'centimeter', factor: 1e-2 },
        m: { label: 'meter', factor: 1 },
        km: { label: 'kilometer', factor: 1e3 },
        in: { label: 'inch', factor: 0.0254 },
        ft: { label: 'foot', factor: 0.3048 },
        yd: { label: 'yard', factor: 0.9144 },
        mi: { label: 'mile', factor: 1609.344 },
        nmi: { label: 'nautical mile', factor: 1852 },
    },
    mass: {
        mg: { label: 'milligram', factor: 1e-6 },
        g: { label: 'gram', factor: 1e-3 },
        kg: { label: 'kilogram', factor: 1 },
        t: { label: 'metric ton', factor: 1000 },
        oz: { label: 'ounce', factor: 0.028349523125 },
        lb: { label: 'pound', factor: 0.45359237 },
        st: { label: 'stone', factor: 6.35029318 },
    },
    temperature: {
        c: { label: 'Celsius', toBase: (v) => v, fromBase: (v) => v },
        f: { label: 'Fahrenheit', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
        k: { label: 'Kelvin', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
        r: { label: 'Rankine', toBase: (v) => ((v - 491.67) * 5) / 9, fromBase: (v) => ((v + 273.15) * 9) / 5 },
    },
    time: {
        ns: { label: 'nanosecond', factor: 1e-9 },
        us: { label: 'microsecond', factor: 1e-6 },
        ms: { label: 'millisecond', factor: 1e-3 },
        s: { label: 'second', factor: 1 },
        min: { label: 'minute', factor: 60 },
        h: { label: 'hour', factor: 3600 },
        d: { label: 'day', factor: 86400 },
        wk: { label: 'week', factor: 604800 },
        yr: { label: 'year (365.25 d)', factor: 31557600 },
    },
    speed: {
        mps: { label: 'meter/second', factor: 1 },
        kmh: { label: 'kilometer/hour', factor: 1 / 3.6 },
        mph: { label: 'mile/hour', factor: 0.44704 },
        kn: { label: 'knot', factor: 1852 / 3600 },
        fps: { label: 'foot/second', factor: 0.3048 },
    },
    area: {
        mm2: { label: 'square millimeter', factor: 1e-6 },
        cm2: { label: 'square centimeter', factor: 1e-4 },
        m2: { label: 'square meter', factor: 1 },
        ha: { label: 'hectare', factor: 1e4 },
        km2: { label: 'square kilometer', factor: 1e6 },
        in2: { label: 'square inch', factor: 0.00064516 },
        ft2: { label: 'square foot', factor: 0.09290304 },
        ac: { label: 'acre', factor: 4046.8564224 },
        mi2: { label: 'square mile', factor: 2589988.110336 },
    },
    volume: {
        ml: { label: 'milliliter', factor: 1e-3 },
        l: { label: 'liter', factor: 1 },
        m3: { label: 'cubic meter', factor: 1000 },
        tsp: { label: 'teaspoon (US)', factor: 0.00492892159375 },
        tbsp: { label: 'tablespoon (US)', factor: 0.01478676478125 },
        floz: { label: 'fluid ounce (US)', factor: 0.0295735295625 },
        cup: { label: 'cup (US)', factor: 0.2365882365 },
        pt: { label: 'pint (US)', factor: 0.473176473 },
        gal: { label: 'gallon (US)', factor: 3.785411784 },
        impgal: { label: 'gallon (imperial)', factor: 4.54609 },
    },
    data: {
        bit: { label: 'bit', factor: 1 / 8 },
        B: { label: 'byte', factor: 1 },
        KB: { label: 'kilobyte', factor: 1e3 },
        MB: { label: 'megabyte', factor: 1e6 },
        GB: { label: 'gigabyte', factor: 1e9 },
        TB: { label: 'terabyte', factor: 1e12 },
        KiB: { label: 'kibibyte', factor: 1024 },
        MiB: { label: 'mebibyte', factor: 1024 ** 2 },
        GiB: { label: 'gibibyte', factor: 1024 ** 3 },
        TiB: { label: 'tebibyte', factor: 1024 ** 4 },
    },
    pressure: {
        pa: { label: 'pascal', factor: 1 },
        kpa: { label: 'kilopascal', factor: 1e3 },
        bar: { label: 'bar', factor: 1e5 },
        atm: { label: 'atmosphere', factor: 101325 },
        psi: { label: 'psi', factor: 6894.757293168 },
        mmhg: { label: 'mmHg', factor: 133.322387415 },
    },
    energy: {
        j: { label: 'joule', factor: 1 },
        kj: { label: 'kilojoule', factor: 1e3 },
        cal: { label: 'calorie', factor: 4.184 },
        kcal: { label: 'kilocalorie', factor: 4184 },
        wh: { label: 'watt-hour', factor: 3600 },
        kwh: { label: 'kilowatt-hour', factor: 3.6e6 },
        ev: { label: 'electronvolt', factor: 1.602176634e-19 },
        btu: { label: 'BTU', factor: 1055.05585262 },
    },
    angle: {
        deg: { label: 'degree', factor: Math.PI / 180 },
        rad: { label: 'radian', factor: 1 },
        grad: { label: 'gradian', factor: Math.PI / 200 },
        turn: { label: 'turn', factor: Math.PI * 2 },
        arcmin: { label: 'arcminute', factor: Math.PI / 10800 },
        arcsec: { label: 'arcsecond', factor: Math.PI / 648000 },
    },
};

export function convertUnits(value: number, unitKey: string): string {
    const [category, unit] = unitKey.split(':');
    const units = UNIT_CATEGORIES[category];
    const from = units?.[unit];
    if (!units || !from) {
        throw new Error('Unknown unit.');
    }
    const base = from.toBase ? from.toBase(value) : value * (from.factor ?? 1);
    const rows = Object.entries(units).map(([key, def]) => {
        const converted = def.fromBase ? def.fromBase(base) : base / (def.factor ?? 1);
        const shown =
            Math.abs(converted) >= 1e15 || (converted !== 0 && Math.abs(converted) < 1e-6)
                ? converted.toExponential(6)
                : formatNumber(Number(converted.toPrecision(12)));
        return `${shown.padStart(20)} ${key.padEnd(7)} ${def.label}${key === unit ? '  ←' : ''}`;
    });
    return rows.join('\n');
}

const UNIT_OPTIONS = Object.entries(UNIT_CATEGORIES).flatMap(([category, units]) =>
    Object.entries(units).map(([key, def]) => ({
        value: `${category}:${key}`,
        label: `${category[0].toUpperCase()}${category.slice(1)} · ${def.label} (${key})`,
    })),
);

// ── Durations and dates ──────────────────────────────────────────────────────

const DURATION_UNITS: Record<string, number> = {
    ms: 1,
    s: 1000,
    sec: 1000,
    m: 60_000,
    min: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    wk: 604_800_000,
};

export function parseDuration(value: string): number {
    const text = value.trim().toLowerCase();
    if (/^-?\d+(\.\d+)?$/.test(text)) {
        return Number(text) * 1000;
    }
    const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
    if (clock) {
        const [h, m, s] =
            clock[3] === undefined
                ? [0, Number(clock[1]), Number(clock[2])]
                : [Number(clock[1]), Number(clock[2]), Number(clock[3])];
        return ((h * 60 + m) * 60 + s) * 1000;
    }
    const iso = /^p(?:(\d+)w)?(?:(\d+)d)?(?:t(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?)?$/.exec(text);
    if (iso && text !== 'p' && text !== 'pt') {
        const [, w, d, h, m, s] = iso.map((part) => Number(part ?? 0));
        return ((((w * 7 + d) * 24 + h) * 60 + m) * 60 + s) * 1000;
    }
    const sign = text.startsWith('-') ? -1 : 1;
    const body = text.replace(/^[-+]/, '');
    const pattern = /(\d+(?:\.\d+)?)\s*(ms|sec|min|hr|wk|s|m|h|d|w)/g;
    let total = 0;
    let consumed = '';
    for (const match of body.matchAll(pattern)) {
        total += Number(match[1]) * DURATION_UNITS[match[2]];
        consumed += match[0];
    }
    if (!consumed || consumed.replace(/\s/g, '') !== body.replace(/\s|,|and/g, '')) {
        throw new Error(`Cannot read duration "${value}". Use 1h 30m, 90s, 01:30:00, or PT1H30M.`);
    }
    return sign * total;
}

export function formatDuration(ms: number): string {
    const sign = ms < 0 ? '-' : '';
    let rest = Math.abs(Math.round(ms));
    const parts: string[] = [];
    for (const [unit, size] of [
        ['d', 86_400_000],
        ['h', 3_600_000],
        ['m', 60_000],
        ['s', 1000],
    ] as const) {
        if (rest >= size) {
            parts.push(`${Math.floor(rest / size)}${unit}`);
            rest %= size;
        }
    }
    if (rest || parts.length === 0) {
        parts.push(`${rest}ms`);
    }
    return sign + parts.join(' ');
}

export function etaReport(total: number, done: number, elapsed: string, now = new Date()): string {
    if (done <= 0) {
        throw new Error('Completed must be greater than zero.');
    }
    if (done > total) {
        throw new Error('Completed cannot exceed total.');
    }
    const elapsedMs = parseDuration(elapsed);
    if (elapsedMs <= 0) {
        throw new Error('Elapsed time must be greater than zero.');
    }
    const perItem = elapsedMs / done;
    const remainingMs = perItem * (total - done);
    const finish = new Date(now.getTime() + remainingMs);
    return [
        `Progress: ${formatNumber(Math.round((done / total) * 10000) / 100)}% (${done} / ${total})`,
        `Rate: ${formatNumber(Number((done / (elapsedMs / 1000)).toPrecision(6)))} items/s · ${formatDuration(perItem)} per item`,
        `Remaining: ${total - done} items · ${formatDuration(remainingMs)}`,
        `Total duration: ${formatDuration(elapsedMs + remainingMs)}`,
        `ETA (local): ${finish.toLocaleString()}`,
        `ETA (UTC): ${finish.toISOString()}`,
    ].join('\n');
}

function parseDate(value: string, label: string): Date {
    const text = (value ?? '').trim();
    if (!text || text.toLowerCase() === 'now') {
        return new Date();
    }
    if (/^-?\d{9,13}$/.test(text)) {
        const num = Number(text);
        return new Date(text.length <= 10 ? num * 1000 : num);
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${label} is not a valid date.`);
    }
    return date;
}

function businessDaysBetween(start: Date, end: Date): number {
    const [from, to] = start <= end ? [start, end] : [end, start];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const stop = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    let count = 0;
    while (cursor.getTime() < stop) {
        const day = cursor.getUTCDay();
        if (day !== 0 && day !== 6) {
            count += 1;
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return start <= end ? count : -count;
}

function addMonthsClamped(date: Date, months: number): Date {
    const result = new Date(date.getTime());
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
}

export function dateDifference(startText: string, endText: string): string {
    const start = parseDate(startText, 'Start');
    const end = parseDate(endText, 'End');
    const ms = end.getTime() - start.getTime();
    const [from, to] = ms >= 0 ? [start, end] : [end, start];
    let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    if (addMonthsClamped(from, months) > to) {
        months -= 1;
    }
    const anchor = addMonthsClamped(from, months);
    const days = Math.floor((to.getTime() - anchor.getTime()) / 86_400_000);
    const years = Math.floor(months / 12);
    months %= 12;
    const abs = Math.abs(ms);
    return [
        `From: ${start.toISOString()}`,
        `To:   ${end.toISOString()}`,
        '',
        `Calendar: ${ms < 0 ? '-' : ''}${years}y ${months}mo ${days}d`,
        `Duration: ${formatDuration(ms)}`,
        `Weeks: ${formatNumber(Number((abs / 604_800_000).toFixed(4)))}`,
        `Days: ${formatNumber(Number((abs / 86_400_000).toFixed(4)))}`,
        `Hours: ${formatNumber(Number((abs / 3_600_000).toFixed(4)))}`,
        `Minutes: ${formatNumber(Number((abs / 60_000).toFixed(2)))}`,
        `Seconds: ${formatNumber(abs / 1000)}`,
        `Business days (Mon–Fri, UTC): ${businessDaysBetween(start, end)}`,
    ].join('\n');
}

export function dateAdd(startText: string, durationText: string, subtract: boolean): string {
    const start = parseDate(startText, 'Start');
    const text = durationText.trim();
    const result = new Date(start.getTime());
    // Calendar units (y, mo) are applied first so month lengths are respected.
    const calendar = /(-?\d+)\s*(y|yr|years?|mo|months?)\b/gi;
    let rest = text;
    for (const match of text.matchAll(calendar)) {
        const amount = Number(match[1]) * (subtract ? -1 : 1);
        if (/^y/i.test(match[2])) {
            result.setUTCFullYear(result.getUTCFullYear() + amount);
        } else {
            result.setUTCMonth(result.getUTCMonth() + amount);
        }
        rest = rest.replace(match[0], '');
    }
    if (rest.trim()) {
        const ms = parseDuration(rest.trim());
        result.setTime(result.getTime() + (subtract ? -ms : ms));
    }
    return [
        `Start: ${start.toISOString()}`,
        `${subtract ? 'Minus' : 'Plus'}: ${text}`,
        '',
        `UTC:   ${result.toISOString()}`,
        `Local: ${result.toLocaleString()}`,
        `Unix:  ${Math.floor(result.getTime() / 1000)}`,
    ].join('\n');
}

// ── Time zones ───────────────────────────────────────────────────────────────

function zoneOffsetMinutes(date: Date, zone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

function validateZone(zone: string): string {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return zone;
    } catch {
        throw new Error(`Unknown time zone "${zone}". Use an IANA name such as Europe/Berlin.`);
    }
}

function formatOffset(minutes: number): string {
    const sign = minutes < 0 ? '-' : '+';
    const abs = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export function wallTimeToInstant(value: string, zone: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!match) {
        return parseDate(value, 'Date');
    }
    const [, y, mo, d, h, mi, s] = match.map((part) => Number(part ?? 0));
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    let instant = guess - zoneOffsetMinutes(new Date(guess), zone) * 60_000;
    instant = guess - zoneOffsetMinutes(new Date(instant), zone) * 60_000;
    return new Date(instant);
}

export const COMMON_ZONES = [
    'UTC',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Moscow',
    'Africa/Lagos',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Pacific/Auckland',
];

export function convertTimeZones(value: string, fromZone: string, targets: string): string {
    const source = validateZone(fromZone.trim() || 'UTC');
    const zones = (targets.trim() ? targets.split(/[\s,]+/).filter(Boolean) : COMMON_ZONES).map(validateZone);
    const instant = wallTimeToInstant(value.trim() || 'now', source);
    const rows = zones.map((zone) => {
        const text = new Intl.DateTimeFormat('en-CA', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'short',
        }).format(instant);
        return `${zone.padEnd(22)} ${text.padEnd(24)} ${formatOffset(zoneOffsetMinutes(instant, zone))}`;
    });
    return [`Instant: ${instant.toISOString()} (source zone ${source})`, '', ...rows].join('\n');
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export const mathTools: UtilityTool[] = [
    {
        id: 'math',
        label: 'Math Evaluator',
        description: 'Evaluate expressions with variables and functions',
        command: 'devx.mathTool',
        icon: 'math.svg',
        defaultVisible: true,
        category: 'Math',
        summary:
            'One expression per line. Supports + - * / % ^ **, !, bitwise & | ~ << >>, 0x/0b/0o literals, variables (x = 2), ans, pi/e/tau/phi, and sin, cos, tan, sqrt, cbrt, log, ln, log2, exp, abs, round, floor, ceil, min, max, pow, hypot, fact, gcd, lcm, avg, sum, deg, rad. No code is executed.',
        fields: [
            {
                id: 'input',
                label: 'Expressions',
                kind: 'textarea',
                rows: 8,
                placeholder: 'r = 4\npi * r^2\nsqrt(2) * 10\n0xff & 0b1010',
            },
        ],
        actions: [{ id: 'evaluate', label: 'Evaluate' }],
        run: (_action, values) => ({ output: evaluateScript(values.input ?? '') }),
    },
    {
        id: 'percentage',
        label: 'Percentage Calculator',
        description: 'Percent of, percent change, and ratios',
        command: 'devx.percentageTool',
        icon: 'percent.svg',
        defaultVisible: true,
        category: 'Math',
        summary:
            'Enter two numbers to see X% of Y, X as a percent of Y, percent change and difference, increase/decrease by X%, and the ratio.',
        fields: [
            { id: 'a', label: 'X', kind: 'number', defaultValue: '15' },
            { id: 'b', label: 'Y', kind: 'number', defaultValue: '200' },
        ],
        actions: [{ id: 'calculate', label: 'Calculate' }],
        run: (_action, values) => ({
            output: percentageReport(readNumber(values.a, 'X', -1e15, 1e15), readNumber(values.b, 'Y', -1e15, 1e15)),
        }),
    },
    {
        id: 'units',
        label: 'Unit Converter',
        description: 'Length, mass, temperature, time, data, speed, and more',
        command: 'devx.unitsTool',
        icon: 'units.svg',
        defaultVisible: true,
        category: 'Math',
        summary:
            'Converts a value to every unit in the same family: length, mass, temperature, time, speed, area, volume, data, pressure, energy, and angle.',
        fields: [
            { id: 'value', label: 'Value', kind: 'number', defaultValue: '1' },
            { id: 'unit', label: 'From unit', kind: 'select', options: UNIT_OPTIONS, defaultValue: 'length:m' },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({
            output: convertUnits(readNumber(values.value, 'Value', -1e300, 1e300), values.unit || 'length:m'),
        }),
    },
    {
        id: 'eta',
        label: 'ETA Calculator',
        description: 'Estimate when a long-running job will finish',
        command: 'devx.etaTool',
        icon: 'eta.svg',
        defaultVisible: true,
        category: 'Math',
        summary:
            'Give the total amount of work, how much is done, and how long it took. Elapsed accepts 90, 1h 30m, 01:30:00, or PT1H30M.',
        fields: [
            { id: 'total', label: 'Total items', kind: 'number', defaultValue: '1000' },
            { id: 'done', label: 'Completed', kind: 'number', defaultValue: '250' },
            { id: 'elapsed', label: 'Elapsed time', kind: 'text', defaultValue: '15m' },
        ],
        actions: [{ id: 'estimate', label: 'Estimate' }],
        run: (_action, values) => ({
            output: etaReport(
                readNumber(values.total, 'Total', 1, 1e15),
                readNumber(values.done, 'Completed', 0, 1e15),
                values.elapsed ?? '',
            ),
        }),
    },
    {
        id: 'date-calc',
        label: 'Date Calculator',
        description: 'Difference between dates, or add and subtract durations',
        command: 'devx.dateCalcTool',
        icon: 'date-calc.svg',
        defaultVisible: true,
        category: 'Convert',
        summary:
            'Dates accept ISO 8601, Unix seconds or milliseconds, or "now". Durations accept 1y 2mo 3d 4h 5m 6s, 01:30:00, or PT1H30M. Calendar math uses UTC.',
        fields: [
            { id: 'start', label: 'Start date', kind: 'text', defaultValue: 'now' },
            { id: 'end', label: 'End date', kind: 'text', placeholder: '2027-01-01T00:00:00Z' },
            { id: 'duration', label: 'Duration', kind: 'text', placeholder: '1y 2mo 10d 4h' },
        ],
        actions: [
            { id: 'diff', label: 'Difference' },
            { id: 'add', label: 'Add duration' },
            { id: 'subtract', label: 'Subtract duration' },
        ],
        run: (action, values) => {
            if (action === 'diff') {
                return { output: dateDifference(values.start ?? '', requireText(values.end, 'End date')) };
            }
            return {
                output: dateAdd(values.start ?? '', requireText(values.duration, 'Duration'), action === 'subtract'),
            };
        },
    },
    {
        id: 'timezone',
        label: 'Time Zone Converter',
        description: 'Show a moment in several time zones',
        command: 'devx.timeZoneTool',
        icon: 'timezone.svg',
        defaultVisible: true,
        category: 'Convert',
        summary:
            'Enter "now", an ISO date, a Unix timestamp, or a wall-clock time (2026-03-08 09:00) in the source zone. Uses the IANA time zone database built into the editor, including daylight saving time.',
        fields: [
            { id: 'input', label: 'Date / time', kind: 'text', defaultValue: 'now' },
            { id: 'from', label: 'Source zone', kind: 'text', defaultValue: 'UTC' },
            {
                id: 'targets',
                label: 'Target zones (blank for common)',
                kind: 'text',
                placeholder: 'America/New_York, Europe/London, Asia/Tokyo',
            },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({
            output: convertTimeZones(values.input ?? 'now', values.from ?? 'UTC', values.targets ?? ''),
        }),
    },
];
