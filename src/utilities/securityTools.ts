import * as bcrypt from 'bcryptjs';
import { choice, linesOf, readInteger, requireText } from './common';
import type { UtilityTool } from './types';

// ── Bcrypt ───────────────────────────────────────────────────────────────────

export function bcryptHash(password: string, rounds: number): string {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(rounds));
}

export function bcryptVerify(password: string, hash: string): boolean {
    const text = hash.trim();
    if (!/^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(text)) {
        throw new Error('Hash is not a bcrypt string ($2a$, $2b$, or $2y$).');
    }
    return bcrypt.compareSync(password, text.replace(/^\$2y\$/, '$2b$'));
}

// ── Password strength ────────────────────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
    '123456',
    '123456789',
    '12345678',
    '12345',
    '1234567',
    '1234567890',
    'password',
    'password1',
    'password123',
    'qwerty',
    'qwerty123',
    'qwertyuiop',
    'abc123',
    '111111',
    '000000',
    '123123',
    'iloveyou',
    'admin',
    'admin123',
    'welcome',
    'welcome1',
    'letmein',
    'monkey',
    'dragon',
    'football',
    'baseball',
    'sunshine',
    'princess',
    'master',
    'shadow',
    'superman',
    'trustno1',
    'passw0rd',
    'p@ssw0rd',
    'p@ssword',
    'changeme',
    'secret',
    'login',
    'starwars',
    'whatever',
    'hello123',
    'zaq12wsx',
    '1q2w3e4r',
    '1qaz2wsx',
    'asdfghjkl',
    'asdf1234',
    'test123',
    'root',
    'toor',
    'default',
]);

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'azertyuiop', 'qwertzuiop'];

export interface StrengthReport {
    score: 0 | 1 | 2 | 3 | 4;
    entropyBits: number;
    warnings: string[];
    lines: string[];
}

function crackTime(seconds: number): string {
    if (seconds < 1) {
        return 'less than a second';
    }
    const units: Array<[string, number]> = [
        ['century', 3155760000],
        ['year', 31557600],
        ['month', 2629800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
        ['second', 1],
    ];
    if (seconds > 3155760000 * 1000) {
        return 'more than 1,000 centuries';
    }
    for (const [unit, size] of units) {
        if (seconds >= size) {
            const count = Math.round(seconds / size);
            return `${count} ${unit === 'century' ? (count === 1 ? 'century' : 'centuries') : unit + (count === 1 ? '' : 's')}`;
        }
    }
    return 'less than a second';
}

export function analyzePassword(password: string): StrengthReport {
    if (!password) {
        throw new Error('Password is required.');
    }
    const chars = [...password];
    const warnings: string[] = [];
    let pool = 0;
    const classes: string[] = [];
    if (/[a-z]/.test(password)) {
        pool += 26;
        classes.push('lowercase');
    }
    if (/[A-Z]/.test(password)) {
        pool += 26;
        classes.push('uppercase');
    }
    if (/\d/.test(password)) {
        pool += 10;
        classes.push('digits');
    }
    if (/[^A-Za-z0-9\s]/.test(password) && /[\x21-\x7e]/.test(password.replace(/[A-Za-z0-9]/g, ''))) {
        pool += 33;
        classes.push('symbols');
    }
    if (/\s/.test(password)) {
        pool += 1;
        classes.push('spaces');
    }
    if (/[^\x00-\x7f]/.test(password)) {
        pool += 100;
        classes.push('non-ASCII');
    }
    let entropy = chars.length * Math.log2(Math.max(pool, 1));

    const lower = password.toLowerCase();
    const leet = lower
        .replace(/[@4]/g, 'a')
        .replace(/3/g, 'e')
        .replace(/[1!|]/g, 'i')
        .replace(/0/g, 'o')
        .replace(/[$5]/g, 's')
        .replace(/7/g, 't');
    if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(leet) || COMMON_PASSWORDS.has(leet.replace(/\d+$/, ''))) {
        warnings.push('This is one of the most common passwords.');
        entropy = Math.min(entropy, 10);
    }
    if (/(.)\1{2,}/.test(password)) {
        warnings.push('Contains a character repeated three or more times.');
        entropy -= 8;
    }
    let sequence = 0;
    for (let index = 2; index < password.length; index += 1) {
        const a = password.charCodeAt(index - 2);
        const b = password.charCodeAt(index - 1);
        const c = password.charCodeAt(index);
        if ((b - a === 1 && c - b === 1) || (a - b === 1 && b - c === 1)) {
            sequence += 1;
        }
    }
    if (sequence > 0) {
        warnings.push('Contains a sequence such as abc or 321.');
        entropy -= sequence * 3;
    }
    for (const row of KEYBOARD_ROWS) {
        for (let index = 0; index + 4 <= row.length; index += 1) {
            if (lower.includes(row.slice(index, index + 4))) {
                warnings.push('Contains a keyboard pattern.');
                entropy -= 10;
                index = row.length;
            }
        }
    }
    if (/(19|20)\d{2}/.test(password)) {
        warnings.push('Contains what looks like a year.');
        entropy -= 5;
    }
    if (chars.length < 12) {
        warnings.push('Shorter than 12 characters.');
    }
    if (classes.length === 1 && chars.length < 20) {
        warnings.push('Uses only one character class.');
    }
    entropy = Math.max(0, Math.round(entropy * 10) / 10);
    const score = (
        entropy < 28 ? 0 : entropy < 36 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : 4
    ) as StrengthReport['score'];
    const guesses = Math.pow(2, entropy) / 2;
    const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
    const lines = [
        `Strength: ${labels[score]} (${score}/4)`,
        `Estimated entropy: ${entropy} bits`,
        `Length: ${chars.length} characters`,
        `Character classes: ${classes.join(', ') || 'none'}`,
        '',
        'Estimated time to guess (average):',
        `  Online, throttled (100/hour): ${crackTime(guesses / (100 / 3600))}`,
        `  Online, unthrottled (10/s): ${crackTime(guesses / 10)}`,
        `  Offline, slow hash (10k/s): ${crackTime(guesses / 1e4)}`,
        `  Offline, fast hash (10B/s): ${crackTime(guesses / 1e10)}`,
    ];
    if (warnings.length) {
        lines.push('', 'Warnings:', ...warnings.map((warning) => `  - ${warning}`));
    }
    return { score, entropyBits: entropy, warnings, lines };
}

// ── CRC / checksums ──────────────────────────────────────────────────────────

function crcTable(poly: number, reflected: boolean, width: 16 | 32): Uint32Array {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c: number;
        if (reflected) {
            c = n;
            for (let k = 0; k < 8; k += 1) {
                c = c & 1 ? (poly ^ (c >>> 1)) >>> 0 : c >>> 1;
            }
        } else {
            const top = width === 32 ? 0x80000000 : 0x8000;
            const mask = width === 32 ? 0xffffffff : 0xffff;
            c = (n << (width - 8)) & mask;
            for (let k = 0; k < 8; k += 1) {
                c = c & top ? ((c << 1) ^ poly) & mask : (c << 1) & mask;
            }
        }
        table[n] = c >>> 0;
    }
    return table;
}

const CRC32_TABLE = crcTable(0xedb88320, true, 32);
const CRC32C_TABLE = crcTable(0x82f63b78, true, 32);
const CRC16_ARC_TABLE = crcTable(0xa001, true, 16);
const CRC16_CCITT_TABLE = crcTable(0x1021, false, 16);

export function crc32(data: Uint8Array, table = CRC32_TABLE): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function crc16Reflected(data: Uint8Array, table: Uint32Array, init: number): number {
    let crc = init;
    for (const byte of data) {
        crc = (table[(crc ^ byte) & 0xff] ^ (crc >>> 8)) & 0xffff;
    }
    return crc;
}

function crc16Normal(data: Uint8Array, table: Uint32Array, init: number): number {
    let crc = init;
    for (const byte of data) {
        crc = (table[((crc >>> 8) ^ byte) & 0xff] ^ (crc << 8)) & 0xffff;
    }
    return crc;
}

export function adler32(data: Uint8Array): number {
    let a = 1;
    let b = 0;
    for (const byte of data) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

export function fnv1a32(data: Uint8Array): number {
    let hash = 0x811c9dc5;
    for (const byte of data) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

export function fnv1a64(data: Uint8Array): bigint {
    let hash = 0xcbf29ce484222325n;
    for (const byte of data) {
        hash ^= BigInt(byte);
        hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return hash;
}

export function murmur3(data: Uint8Array, seed = 0): number {
    let h = seed >>> 0;
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    const blocks = Math.floor(data.length / 4);
    for (let index = 0; index < blocks; index += 1) {
        const offset = index * 4;
        let k = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
        k = Math.imul(k, c1);
        k = (k << 15) | (k >>> 17);
        k = Math.imul(k, c2);
        h ^= k;
        h = (h << 13) | (h >>> 19);
        h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
    }
    let k = 0;
    const tail = blocks * 4;
    switch (data.length & 3) {
        case 3:
            k ^= data[tail + 2] << 16;
        // falls through
        case 2:
            k ^= data[tail + 1] << 8;
        // falls through
        case 1:
            k ^= data[tail];
            k = Math.imul(k, c1);
            k = (k << 15) | (k >>> 17);
            k = Math.imul(k, c2);
            h ^= k;
    }
    h ^= data.length;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

export function djb2(data: Uint8Array): number {
    let hash = 5381;
    for (const byte of data) {
        hash = (Math.imul(hash, 33) + byte) >>> 0;
    }
    return hash;
}

export function checksumReport(value: string, encoding: string): string {
    let data: Buffer;
    if (encoding === 'hex') {
        const clean = value.replace(/\s|0x|,/gi, '');
        if (!/^([0-9a-f]{2})*$/i.test(clean)) {
            throw new Error('Hex input must contain an even number of hex digits.');
        }
        data = Buffer.from(clean, 'hex');
    } else if (encoding === 'base64') {
        data = Buffer.from(value.trim(), 'base64');
    } else {
        data = Buffer.from(value, 'utf8');
    }
    const hex = (num: number, width: number) => num.toString(16).padStart(width, '0');
    const c32 = crc32(data);
    return [
        `Bytes: ${data.length}`,
        '',
        `CRC-32 (zip, PNG):     ${hex(c32, 8)}  (${c32})`,
        `CRC-32C (Castagnoli):  ${hex(crc32(data, CRC32C_TABLE), 8)}`,
        `CRC-16/ARC:            ${hex(crc16Reflected(data, CRC16_ARC_TABLE, 0), 4)}`,
        `CRC-16/MODBUS:         ${hex(crc16Reflected(data, CRC16_ARC_TABLE, 0xffff), 4)}`,
        `CRC-16/CCITT-FALSE:    ${hex(crc16Normal(data, CRC16_CCITT_TABLE, 0xffff), 4)}`,
        `CRC-16/XMODEM:         ${hex(crc16Normal(data, CRC16_CCITT_TABLE, 0), 4)}`,
        `Adler-32:              ${hex(adler32(data), 8)}`,
        `FNV-1a 32:             ${hex(fnv1a32(data), 8)}`,
        `FNV-1a 64:             ${fnv1a64(data).toString(16).padStart(16, '0')}`,
        `MurmurHash3 x86 32:    ${hex(murmur3(data), 8)}`,
        `djb2:                  ${hex(djb2(data), 8)}`,
        `Sum mod 256:           ${hex(
            data.reduce((sum, byte) => (sum + byte) & 0xff, 0),
            2,
        )}`,
        `XOR:                   ${hex(
            data.reduce((acc, byte) => acc ^ byte, 0),
            2,
        )}`,
    ].join('\n');
}

// ── Classic ciphers ──────────────────────────────────────────────────────────

function shiftLetters(value: string, shift: number): string {
    return value.replace(/[a-z]/gi, (char) => {
        const base = char <= 'Z' ? 65 : 97;
        return String.fromCharCode(((((char.charCodeAt(0) - base + shift) % 26) + 26) % 26) + base);
    });
}

export function runCipher(value: string, cipher: string, decode: boolean, key: string): string {
    switch (cipher) {
        case 'rot13':
            return shiftLetters(value, 13);
        case 'rot47':
            return value.replace(/[!-~]/g, (char) => String.fromCharCode(33 + ((char.charCodeAt(0) + 14) % 94)));
        case 'rot5':
            return value.replace(/\d/g, (digit) => String((Number(digit) + 5) % 10));
        case 'rot18':
            return runCipher(shiftLetters(value, 13), 'rot5', decode, key);
        case 'caesar': {
            const shift = Number(key || '3');
            if (!Number.isInteger(shift)) {
                throw new Error('Caesar key must be an integer shift.');
            }
            return shiftLetters(value, decode ? -shift : shift);
        }
        case 'atbash':
            return value.replace(/[a-z]/gi, (char) => {
                const base = char <= 'Z' ? 65 : 97;
                return String.fromCharCode(base + 25 - (char.charCodeAt(0) - base));
            });
        case 'vigenere': {
            const letters = key.toLowerCase().replace(/[^a-z]/g, '');
            if (!letters) {
                throw new Error('Vigenère needs a key made of letters.');
            }
            let position = 0;
            return value.replace(/[a-z]/gi, (char) => {
                const shift = letters.charCodeAt(position % letters.length) - 97;
                position += 1;
                return shiftLetters(char, decode ? -shift : shift);
            });
        }
        case 'reverse':
            return [...value].reverse().join('');
        case 'xor': {
            if (!key) {
                throw new Error('XOR needs a key.');
            }
            const keyBytes = Buffer.from(key, 'utf8');
            const input = decode ? Buffer.from(value.replace(/\s/g, ''), 'hex') : Buffer.from(value, 'utf8');
            const out = Buffer.from(input.map((byte, index) => byte ^ keyBytes[index % keyBytes.length]));
            return decode ? out.toString('utf8') : out.toString('hex');
        }
        default:
            throw new Error('Unknown cipher.');
    }
}

// ── String obfuscator ────────────────────────────────────────────────────────

export function obfuscate(
    value: string,
    keepStart: number,
    keepEnd: number,
    mask: string,
    keepSpaces: boolean,
): string {
    const symbol = [...(mask || '*')][0];
    return linesOf(value)
        .map((line) => {
            const chars = [...line];
            return chars
                .map((char, index) => {
                    if (index < keepStart || index >= chars.length - keepEnd) {
                        return char;
                    }
                    if (keepSpaces && /\s/.test(char)) {
                        return char;
                    }
                    return symbol;
                })
                .join('');
        })
        .join('\n');
}

// ── IBAN / Luhn / ISBN / EAN ─────────────────────────────────────────────────

const IBAN_LENGTHS: Record<string, number> = {
    AD: 24,
    AE: 23,
    AL: 28,
    AT: 20,
    AZ: 28,
    BA: 20,
    BE: 16,
    BG: 22,
    BH: 22,
    BR: 29,
    BY: 28,
    CH: 21,
    CR: 22,
    CY: 28,
    CZ: 24,
    DE: 22,
    DK: 18,
    DO: 28,
    EE: 20,
    EG: 29,
    ES: 24,
    FI: 18,
    FO: 18,
    FR: 27,
    GB: 22,
    GE: 22,
    GI: 23,
    GL: 18,
    GR: 27,
    GT: 28,
    HR: 21,
    HU: 28,
    IE: 22,
    IL: 23,
    IQ: 23,
    IS: 26,
    IT: 27,
    JO: 30,
    KW: 30,
    KZ: 20,
    LB: 28,
    LC: 32,
    LI: 21,
    LT: 20,
    LU: 20,
    LV: 21,
    MC: 27,
    MD: 24,
    ME: 22,
    MK: 19,
    MR: 27,
    MT: 31,
    MU: 30,
    NL: 18,
    NO: 15,
    PK: 24,
    PL: 28,
    PS: 29,
    PT: 25,
    QA: 29,
    RO: 24,
    RS: 22,
    SA: 24,
    SC: 31,
    SE: 24,
    SI: 19,
    SK: 24,
    SM: 27,
    ST: 25,
    SV: 28,
    TL: 23,
    TN: 24,
    TR: 26,
    UA: 29,
    VA: 22,
    VG: 24,
    XK: 20,
};

function mod97(digits: string): number {
    let remainder = 0;
    for (const char of digits) {
        remainder = (remainder * 10 + Number(char)) % 97;
    }
    return remainder;
}

export function validateIban(value: string): string[] {
    const iban = value.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
        return ['Valid: no', 'Reason: an IBAN starts with a 2-letter country code and 2 check digits.'];
    }
    const country = iban.slice(0, 2);
    const expected = IBAN_LENGTHS[country];
    const rearranged = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
    const checksumOk = mod97(rearranged) === 1;
    const lengthOk = expected === undefined || iban.length === expected;
    const lines = [
        `Valid: ${checksumOk && lengthOk ? 'yes' : 'no'}`,
        `Country: ${country}${expected === undefined ? ' (length not in the registry list)' : ''}`,
        `Check digits: ${iban.slice(2, 4)} (${checksumOk ? 'mod-97 OK' : 'mod-97 failed'})`,
        `Length: ${iban.length}${expected !== undefined ? ` (expected ${expected})` : ''}`,
        `BBAN: ${iban.slice(4)}`,
        `Formatted: ${iban.replace(/(.{4})/g, '$1 ').trim()}`,
        `Electronic: ${iban}`,
    ];
    if (!checksumOk) {
        const base = (iban.slice(4) + country + '00').replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
        lines.push(`Expected check digits for this BBAN: ${String(98 - mod97(base)).padStart(2, '0')}`);
    }
    return lines;
}

export function luhnValid(digits: string): boolean {
    let sum = 0;
    let double = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
        let digit = Number(digits[index]);
        if (double) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }
    return digits.length > 1 && sum % 10 === 0;
}

function luhnCheckDigit(payload: string): number {
    for (let digit = 0; digit <= 9; digit += 1) {
        if (luhnValid(payload + digit)) {
            return digit;
        }
    }
    return 0;
}

function cardBrand(digits: string): string {
    const rules: Array<[RegExp, string]> = [
        [/^4/, 'Visa'],
        [/^(5[1-5]|2(2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720))/, 'Mastercard'],
        [/^3[47]/, 'American Express'],
        [/^(6011|65|64[4-9]|622)/, 'Discover'],
        [/^35(2[89]|[3-8])/, 'JCB'],
        [/^3(0[0-5]|[68])/, 'Diners Club'],
        [/^62/, 'UnionPay'],
        [/^(5018|5020|5038|6304|6759|676[1-3])/, 'Maestro'],
    ];
    return rules.find(([pattern]) => pattern.test(digits))?.[1] ?? 'Unknown';
}

export function validateLuhn(value: string): string[] {
    const digits = value.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(digits)) {
        return ['Valid: no', 'Reason: only digits, spaces, and hyphens are allowed.'];
    }
    const valid = luhnValid(digits);
    const lines = [
        `Valid (Luhn): ${valid ? 'yes' : 'no'}`,
        `Digits: ${digits.length}`,
        `Card network (by prefix): ${cardBrand(digits)}`,
    ];
    if (!valid) {
        lines.push(`Check digit for ${digits.slice(0, -1)}: ${luhnCheckDigit(digits.slice(0, -1))}`);
    }
    return lines;
}

export function validateIsbn(value: string): string[] {
    const clean = value.replace(/[\s-]/g, '').toUpperCase();
    if (/^\d{9}[\dX]$/.test(clean)) {
        const sum = [...clean].reduce(
            (total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index),
            0,
        );
        const valid = sum % 11 === 0;
        const isbn13 = `978${clean.slice(0, 9)}`;
        return [`Type: ISBN-10`, `Valid: ${valid ? 'yes' : 'no'}`, `ISBN-13: ${isbn13}${gtinCheckDigit(isbn13)}`];
    }
    if (/^\d{13}$/.test(clean)) {
        const valid = gtinValid(clean);
        const lines = [`Type: ISBN-13 / EAN-13`, `Valid: ${valid ? 'yes' : 'no'}`];
        if (clean.startsWith('978')) {
            const core = clean.slice(3, 12);
            const sum = [...core].reduce((total, char, index) => total + Number(char) * (10 - index), 0);
            const check = (11 - (sum % 11)) % 11;
            lines.push(`ISBN-10: ${core}${check === 10 ? 'X' : check}`);
        }
        return lines;
    }
    return ['Valid: no', 'Reason: ISBN must have 10 or 13 digits.'];
}

function gtinCheckDigit(payload: string): number {
    const sum = [...payload]
        .reverse()
        .reduce((total, char, index) => total + Number(char) * (index % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10;
}

function gtinValid(digits: string): boolean {
    return gtinCheckDigit(digits.slice(0, -1)) === Number(digits.slice(-1));
}

export function validateGtin(value: string): string[] {
    const digits = value.replace(/[\s-]/g, '');
    if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits)) {
        return ['Valid: no', 'Reason: EAN-8, UPC-A (12), EAN-13, or GTIN-14 expected.'];
    }
    const kind = { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'GTIN-14' }[digits.length as 8 | 12 | 13 | 14];
    const valid = gtinValid(digits);
    const lines = [`Type: ${kind}`, `Valid: ${valid ? 'yes' : 'no'}`];
    if (!valid) {
        lines.push(`Expected check digit: ${gtinCheckDigit(digits.slice(0, -1))}`);
    }
    return lines;
}

export function validateNumber(value: string, kind: string): string {
    const text = requireText(value, 'Value').trim();
    let resolved = kind;
    if (kind === 'auto') {
        const compact = text.replace(/[\s-]/g, '');
        if (/^[A-Za-z]{2}\d{2}/.test(compact)) {
            resolved = 'iban';
        } else if (/^\d{9}[\dXx]$/.test(compact) || /^97[89]\d{10}$/.test(compact)) {
            resolved = 'isbn';
        } else if (/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(compact) && gtinValid(compact)) {
            resolved = 'gtin';
        } else {
            resolved = 'luhn';
        }
    }
    const lines =
        resolved === 'iban'
            ? validateIban(text)
            : resolved === 'isbn'
              ? validateIsbn(text)
              : resolved === 'gtin'
                ? validateGtin(text)
                : validateLuhn(text);
    return [`Checked as: ${resolved.toUpperCase()}`, ...lines].join('\n');
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export const securityTools: UtilityTool[] = [
    {
        id: 'bcrypt',
        label: 'Bcrypt',
        description: 'Hash and verify bcrypt passwords',
        command: 'devx.bcryptTool',
        icon: 'bcrypt.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary:
            'Creates $2b$ hashes compatible with most frameworks and verifies $2a$, $2b$, and $2y$ hashes. Bcrypt only uses the first 72 bytes of a password. Higher cost is slower.',
        fields: [
            { id: 'password', label: 'Password', kind: 'text' },
            { id: 'rounds', label: 'Cost (4–15)', kind: 'number', defaultValue: '10' },
            { id: 'hash', label: 'Hash to verify', kind: 'text', placeholder: '$2b$10$...' },
        ],
        actions: [
            { id: 'hash', label: 'Hash' },
            { id: 'verify', label: 'Verify' },
        ],
        run: (action, values) => {
            const password = values.password ?? '';
            if (!password) {
                throw new Error('Password is required.');
            }
            const notice =
                Buffer.byteLength(password, 'utf8') > 72
                    ? 'Only the first 72 bytes of the password affect the hash.'
                    : undefined;
            if (action === 'verify') {
                const ok = bcryptVerify(password, requireText(values.hash, 'Hash'));
                return { output: ok ? 'Match' : 'No match', notice };
            }
            return { output: bcryptHash(password, readInteger(values.rounds, 'Cost', 4, 15)), notice };
        },
    },
    {
        id: 'password-strength',
        label: 'Password Strength',
        description: 'Estimate entropy and time to crack a password',
        command: 'devx.passwordStrengthTool',
        icon: 'strength.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary:
            'Estimates entropy from length and character classes, then penalizes common passwords, repeats, sequences, keyboard patterns, and years. The password is not stored or sent.',
        fields: [{ id: 'password', label: 'Password', kind: 'text' }],
        actions: [{ id: 'analyze', label: 'Analyze' }],
        run: (_action, values) => {
            const report = analyzePassword(values.password ?? '');
            const colors = ['#e5534b', '#e0823d', '#d4a72c', '#57ab5a', '#2ea043'];
            const width = (report.score + 1) * 20;
            return {
                output: report.lines.join('\n'),
                previewHtml: `<div style="height:10px;border-radius:5px;background:rgba(128,128,128,.25);max-width:420px"><div style="height:10px;border-radius:5px;width:${width}%;background:${colors[report.score]}"></div></div>`,
            };
        },
    },
    {
        id: 'checksum',
        label: 'CRC / Checksum',
        description: 'CRC-32, CRC-16, Adler-32, FNV-1a, MurmurHash3',
        command: 'devx.checksumTool',
        icon: 'crc.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary:
            'Non-cryptographic checksums used by zip, PNG, iSCSI, Modbus, XMODEM, hash tables, and more. Use Hash Generator for SHA digests.',
        fields: [
            { id: 'input', label: 'Input', kind: 'textarea', rows: 6 },
            {
                id: 'encoding',
                label: 'Input encoding',
                kind: 'select',
                options: [
                    { value: 'utf8', label: 'UTF-8 text' },
                    { value: 'hex', label: 'Hex bytes' },
                    { value: 'base64', label: 'Base64' },
                ],
                defaultValue: 'utf8',
            },
        ],
        actions: [{ id: 'compute', label: 'Compute' }],
        run: (_action, values) => ({
            output: checksumReport(
                values.input ?? '',
                choice(values.encoding, 'encoding', ['utf8', 'hex', 'base64'], 'utf8'),
            ),
        }),
    },
    {
        id: 'cipher',
        label: 'Classic Ciphers',
        description: 'ROT13, ROT47, Caesar, Atbash, Vigenère, XOR',
        command: 'devx.cipherTool',
        icon: 'cipher.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary:
            'Text transforms for puzzles, spoilers, and CTFs. These ciphers do not protect data; use AES Encrypt / Decrypt for real encryption.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 6 },
            {
                id: 'cipher',
                label: 'Cipher',
                kind: 'select',
                options: [
                    { value: 'rot13', label: 'ROT13' },
                    { value: 'rot47', label: 'ROT47' },
                    { value: 'rot5', label: 'ROT5 (digits)' },
                    { value: 'rot18', label: 'ROT18 (ROT13 + ROT5)' },
                    { value: 'caesar', label: 'Caesar (key = shift)' },
                    { value: 'atbash', label: 'Atbash' },
                    { value: 'vigenere', label: 'Vigenère (key = word)' },
                    { value: 'xor', label: 'XOR (key, hex output)' },
                    { value: 'reverse', label: 'Reverse' },
                ],
                defaultValue: 'rot13',
            },
            { id: 'key', label: 'Key', kind: 'text', placeholder: '3 or LEMON' },
        ],
        actions: [
            { id: 'encode', label: 'Encode' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => ({
            output: runCipher(
                requireText(values.input, 'Text'),
                values.cipher || 'rot13',
                action === 'decode',
                values.key ?? '',
            ),
        }),
    },
    {
        id: 'obfuscate',
        label: 'String Obfuscator',
        description: 'Mask secrets, keeping only a few characters visible',
        command: 'devx.obfuscateTool',
        icon: 'obfuscate.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary:
            'Masks each line so you can share tokens, card numbers, or emails in tickets and screenshots, for example sk_live_****************abcd.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 5 },
            { id: 'start', label: 'Keep first', kind: 'number', defaultValue: '4' },
            { id: 'end', label: 'Keep last', kind: 'number', defaultValue: '4' },
            { id: 'mask', label: 'Mask character', kind: 'text', defaultValue: '*' },
            {
                id: 'spaces',
                label: 'Spaces',
                kind: 'select',
                options: [
                    { value: 'keep', label: 'Keep' },
                    { value: 'mask', label: 'Mask' },
                ],
                defaultValue: 'keep',
            },
        ],
        actions: [{ id: 'obfuscate', label: 'Obfuscate' }],
        run: (_action, values) => ({
            output: obfuscate(
                requireText(values.input, 'Text'),
                readInteger(values.start, 'Keep first', 0, 1000),
                readInteger(values.end, 'Keep last', 0, 1000),
                values.mask ?? '*',
                values.spaces !== 'mask',
            ),
        }),
    },
    {
        id: 'validators',
        label: 'IBAN / Card / ISBN Validator',
        description: 'Validate IBAN, Luhn (credit card), ISBN, and EAN/UPC check digits',
        command: 'devx.validatorTool',
        icon: 'validator.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary:
            'Checks the check digits only: IBAN mod-97 and country length, Luhn with card network by prefix, ISBN-10/13 with conversion, and EAN-8/UPC-A/EAN-13/GTIN-14. It does not confirm that an account or card exists.',
        fields: [
            { id: 'input', label: 'Value', kind: 'text', placeholder: 'GB82 WEST 1234 5698 7654 32' },
            {
                id: 'kind',
                label: 'Type',
                kind: 'select',
                options: [
                    { value: 'auto', label: 'Detect' },
                    { value: 'iban', label: 'IBAN' },
                    { value: 'luhn', label: 'Luhn / card number' },
                    { value: 'isbn', label: 'ISBN' },
                    { value: 'gtin', label: 'EAN / UPC / GTIN' },
                ],
                defaultValue: 'auto',
            },
        ],
        actions: [{ id: 'validate', label: 'Validate' }],
        run: (_action, values) => ({ output: validateNumber(values.input ?? '', values.kind || 'auto') }),
    },
];
