import * as zlib from 'zlib';
import { domainToASCII, domainToUnicode } from 'url';
import { MAX_INPUT_BYTES } from '../limits';
import { choice, requireText } from './common';
import type { UtilityTool } from './types';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
    copy: '©',
    reg: '®',
    trade: '™',
    mdash: '—',
    ndash: '–',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
};

export function encodeUrl(value: string, mode: string): string {
    if (mode === 'uri') {
        return encodeURI(value);
    }
    if (mode === 'form') {
        return encodeURIComponent(value).replace(/%20/g, '+');
    }
    return encodeURIComponent(value);
}

export function decodeUrl(value: string, mode: string): string {
    try {
        const prepared = mode === 'form' ? value.replace(/\+/g, ' ') : value;
        return mode === 'uri' ? decodeURI(prepared) : decodeURIComponent(prepared);
    } catch {
        throw new Error('Input is not valid percent-encoding.');
    }
}

export function encodeHtml(value: string): string {
    return Array.from(value)
        .map((char) => {
            switch (char) {
                case '&':
                    return '&amp;';
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '"':
                    return '&quot;';
                case "'":
                    return '&#39;';
                default: {
                    const code = char.codePointAt(0) ?? 0;
                    return code < 32 || code === 127 || code > 126 ? `&#${code};` : char;
                }
            }
        })
        .join('');
}

export function decodeHtml(value: string): string {
    return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, body: string) => {
        if (body.startsWith('#x') || body.startsWith('#X')) {
            const code = Number.parseInt(body.slice(2), 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
        }
        if (body.startsWith('#')) {
            const code = Number.parseInt(body.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
        }
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : entity;
    });
}

export function encodeHex(value: string, format: string): string {
    const bytes = Buffer.from(value, 'utf8');
    if (format === 'base64') {
        return bytes.toString('base64');
    }
    if (format === 'binary') {
        return [...bytes].map((byte) => byte.toString(2).padStart(8, '0')).join(' ');
    }
    const hex = bytes.toString('hex');
    return format === 'spaced' ? hex.replace(/(.{2})/g, '$1 ').trim() : hex;
}

export function decodeHex(value: string, format: string): string {
    if (format === 'base64') {
        return decodeBase64Strict(value).toString('utf8');
    }
    if (format === 'binary') {
        const bits = value.replace(/\s+/g, '');
        if (!/^[01]*$/.test(bits) || bits.length % 8 !== 0) {
            throw new Error('Binary input must be groups of 8 bits.');
        }
        const bytes = [];
        for (let index = 0; index < bits.length; index += 8) {
            bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
        }
        return Buffer.from(bytes).toString('utf8');
    }
    const hex = value.replace(/0x/gi, '').replace(/\s+/g, '');
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
        throw new Error('Hex input must contain an even number of hex digits.');
    }
    return Buffer.from(hex, 'hex').toString('utf8');
}

export function encodeBase32(data: Buffer): string {
    if (data.length === 0) {
        return '';
    }
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of data) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32[(value << (5 - bits)) & 31];
    }
    while (output.length % 8 !== 0) {
        output += '=';
    }
    return output;
}

export function decodeBase32(value: string): Buffer {
    const compact = value.trim().replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
    if (!compact) {
        return Buffer.alloc(0);
    }
    let bits = 0;
    let buffer = 0;
    const bytes: number[] = [];
    for (const char of compact) {
        const index = BASE32.indexOf(char);
        if (index < 0) {
            throw new Error('Input is not valid Base32.');
        }
        buffer = (buffer << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((buffer >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

export function encodeBase58(data: Buffer): string {
    let zeros = 0;
    while (zeros < data.length && data[zeros] === 0) {
        zeros += 1;
    }
    let value = 0n;
    for (const byte of data) {
        value = (value << 8n) + BigInt(byte);
    }
    let encoded = '';
    while (value > 0n) {
        const remainder = Number(value % 58n);
        value /= 58n;
        encoded = BASE58[remainder] + encoded;
    }
    return `${'1'.repeat(zeros)}${encoded}`;
}

export function decodeBase58(value: string): Buffer {
    const compact = value.trim();
    if (!compact) {
        return Buffer.alloc(0);
    }
    let zeros = 0;
    while (zeros < compact.length && compact[zeros] === '1') {
        zeros += 1;
    }
    let numeric = 0n;
    for (const char of compact) {
        const index = BASE58.indexOf(char);
        if (index < 0) {
            throw new Error('Input is not valid Base58.');
        }
        numeric = numeric * 58n + BigInt(index);
    }
    const bytes: number[] = [];
    while (numeric > 0n) {
        bytes.push(Number(numeric & 255n));
        numeric >>= 8n;
    }
    bytes.reverse();
    return Buffer.concat([Buffer.alloc(zeros), Buffer.from(bytes)]);
}

export function escapeUnicode(value: string, mode: string): string {
    if (mode === 'all') {
        return JSON.stringify(value).slice(1, -1);
    }
    return Array.from(value)
        .map((char) => {
            const code = char.codePointAt(0) ?? 0;
            if (code >= 32 && code <= 126) {
                return char;
            }
            const hex = code.toString(16);
            return code > 0xffff ? `\\u{${hex}}` : `\\u${hex.padStart(4, '0')}`;
        })
        .join('');
}

export function unescapeUnicode(value: string): string {
    try {
        return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
    } catch {
        throw new Error('Input contains an invalid escape sequence.');
    }
}

export function encodePunycode(value: string): string {
    return convertDomain(value, domainToASCII);
}

export function decodePunycode(value: string): string {
    return convertDomain(value, domainToUnicode);
}

export function gzipCompress(value: string): { base64: string; notice: string } {
    const input = Buffer.from(value, 'utf8');
    const compressed = zlib.gzipSync(input);
    return {
        base64: compressed.toString('base64'),
        notice: `${input.length} bytes compressed to ${compressed.length} bytes. Output is Base64.`,
    };
}

export function gzipDecompress(value: string): { text: string; notice: string } {
    const compressed = decodeBase64Strict(value);
    const output = zlib.gunzipSync(compressed, { maxOutputLength: MAX_INPUT_BYTES });
    return {
        text: output.toString('utf8'),
        notice: `${compressed.length} bytes expanded to ${output.length} bytes.`,
    };
}

export function encodeDataUri(value: string, mime: string): string {
    const type = mime.trim() || 'text/plain;charset=utf-8';
    if (!/^[\w.+-]+\/[\w.+-]+(?:;charset=[\w.-]+)?$/.test(type)) {
        throw new Error('MIME type must look like text/plain or text/plain;charset=utf-8.');
    }
    return `data:${type};base64,${Buffer.from(value, 'utf8').toString('base64')}`;
}

export function decodeDataUri(value: string): { text: string; notice?: string } {
    const match = value.trim().match(/^data:([^,]*),(.*)$/s);
    if (!match) {
        throw new Error('Input is not a data URI.');
    }
    const meta = match[1];
    const data = match[2];
    const text = /;base64/i.test(meta) ? decodeBase64Strict(data).toString('utf8') : decodeURIComponent(data);
    const media = meta.replace(/;base64/i, '');
    return { text, notice: media ? `Media type: ${media}` : undefined };
}

export function parseQuery(value: string): string {
    const query = value.trim().replace(/^\?/, '');
    const params = new URLSearchParams(query);
    const grouped: Record<string, string | string[]> = {};
    for (const [key, item] of params.entries()) {
        const current = grouped[key];
        if (current === undefined) {
            grouped[key] = item;
        } else if (Array.isArray(current)) {
            current.push(item);
        } else {
            grouped[key] = [current, item];
        }
    }
    return JSON.stringify(grouped, null, 2);
}

export function buildQuery(value: string): string {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Build a query from a JSON object.');
    }
    const params = new URLSearchParams();
    for (const [key, item] of Object.entries(parsed)) {
        const values = Array.isArray(item) ? item : [item];
        for (const entry of values) {
            if (entry === null || entry === undefined) {
                continue;
            }
            if (typeof entry === 'object') {
                throw new Error(`Value for ${key} must be a string, number, boolean, or array of those.`);
            }
            params.append(key, String(entry));
        }
    }
    return params.toString();
}

export function decodeBase64Strict(value: string): Buffer {
    const compact = value.trim().replace(/\s+/g, '');
    if (!compact) {
        return Buffer.alloc(0);
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2,3})?$/.test(compact)) {
        throw new Error('Input is not valid Base64.');
    }
    return Buffer.from(compact, 'base64');
}

function convertDomain(value: string, convert: (domain: string) => string): string {
    const text = requireText(value, 'Domain').trim();
    if (text.includes('://')) {
        const url = new URL(text);
        url.hostname = convert(url.hostname);
        return url.toString();
    }
    if (text.includes('@')) {
        const at = text.lastIndexOf('@');
        return `${text.slice(0, at + 1)}${convert(text.slice(at + 1))}`;
    }
    return convert(text);
}

const urlModes = [
    { value: 'component', label: 'Component (encodeURIComponent)' },
    { value: 'uri', label: 'URI (encodeURI)' },
    { value: 'form', label: 'Form (+ for spaces)' },
];

const byteFormats = [
    { value: 'hex', label: 'Hex' },
    { value: 'spaced', label: 'Spaced hex' },
    { value: 'binary', label: 'Binary' },
    { value: 'base64', label: 'Base64' },
];

export const encodeTools: UtilityTool[] = [
    {
        id: 'url',
        label: 'URL Encode / Decode',
        description: 'Percent-encode or decode URL text',
        command: 'devx.urlTool',
        icon: 'url.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Encode or decode URI components, full URIs, and application/x-www-form-urlencoded text.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 8, placeholder: 'a b&c=d' },
            { id: 'mode', label: 'Mode', kind: 'select', options: urlModes, defaultValue: 'component' },
        ],
        actions: [
            { id: 'encode', label: 'Encode' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => {
            const input = requireText(values.input, 'Text');
            const mode = choice(values.mode, 'mode', ['component', 'uri', 'form'], 'component');
            return { output: action === 'decode' ? decodeUrl(input, mode) : encodeUrl(input, mode) };
        },
    },
    {
        id: 'html',
        label: 'HTML Encode / Decode',
        description: 'Encode or decode HTML and XML entities',
        command: 'devx.htmlTool',
        icon: 'html.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Escape text for HTML or XML, and decode named or numeric character references.',
        fields: [{ id: 'input', label: 'Text', kind: 'textarea', rows: 8, placeholder: '<tag attr="value">' }],
        actions: [
            { id: 'encode', label: 'Encode' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => ({
            output: action === 'decode' ? decodeHtml(requireText(values.input, 'Text')) : encodeHtml(requireText(values.input, 'Text')),
        }),
    },
    {
        id: 'hex',
        label: 'Hex / Binary Encode',
        description: 'Convert text to hex, binary, or Base64',
        command: 'devx.hexTool',
        icon: 'hex.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Encode UTF-8 text as hex, spaced hex, binary, or Base64, and decode those forms back to text.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 8 },
            { id: 'format', label: 'Format', kind: 'select', options: byteFormats, defaultValue: 'hex' },
        ],
        actions: [
            { id: 'encode', label: 'Encode' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => {
            const format = choice(values.format, 'format', ['hex', 'spaced', 'binary', 'base64'], 'hex');
            const input = requireText(values.input, 'Text');
            return { output: action === 'decode' ? decodeHex(input, format) : encodeHex(input, format) };
        },
    },
    {
        id: 'base32',
        label: 'Base32 / Base58',
        description: 'Encode or decode Base32 and Base58',
        command: 'devx.base32Tool',
        icon: 'base32.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Base32 uses the RFC 4648 alphabet. Base58 uses the Bitcoin alphabet without 0, O, I, or l.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 8 },
            {
                id: 'alphabet',
                label: 'Alphabet',
                kind: 'select',
                options: [
                    { value: 'base32', label: 'Base32' },
                    { value: 'base58', label: 'Base58' },
                ],
                defaultValue: 'base32',
            },
        ],
        actions: [
            { id: 'encode', label: 'Encode' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => {
            const alphabet = choice(values.alphabet, 'alphabet', ['base32', 'base58'], 'base32');
            const input = requireText(values.input, 'Text');
            if (action === 'decode') {
                const decoded = alphabet === 'base32' ? decodeBase32(input) : decodeBase58(input);
                return { output: decoded.toString('utf8') };
            }
            const encoded = alphabet === 'base32' ? encodeBase32(Buffer.from(input, 'utf8')) : encodeBase58(Buffer.from(input, 'utf8'));
            return { output: encoded };
        },
    },
    {
        id: 'unicode',
        label: 'Unicode Escape',
        description: 'Escape or unescape Unicode code points',
        command: 'devx.unicodeTool',
        icon: 'unicode.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Escape non-ASCII and control characters, or unescape \\u, \\u{}, \\x, and JSON string escapes.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 8 },
            {
                id: 'mode',
                label: 'Escape mode',
                kind: 'select',
                options: [
                    { value: 'non-ascii', label: 'Non-ASCII and controls' },
                    { value: 'all', label: 'JSON string escapes' },
                ],
                defaultValue: 'non-ascii',
            },
        ],
        actions: [
            { id: 'escape', label: 'Escape' },
            { id: 'unescape', label: 'Unescape' },
        ],
        run: (action, values) => {
            const input = requireText(values.input, 'Text');
            if (action === 'unescape') {
                return { output: unescapeUnicode(input) };
            }
            return { output: escapeUnicode(input, choice(values.mode, 'mode', ['non-ascii', 'all'], 'non-ascii')) };
        },
    },
    {
        id: 'punycode',
        label: 'Punycode / IDN',
        description: 'Convert internationalized domain names',
        command: 'devx.punycodeTool',
        icon: 'punycode.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Convert a domain, email domain, or URL hostname between Unicode and ASCII punycode (IDNA).',
        fields: [{ id: 'input', label: 'Domain, email, or URL', kind: 'textarea', rows: 4, placeholder: 'münchen.de' }],
        actions: [
            { id: 'to-ascii', label: 'To ASCII' },
            { id: 'to-unicode', label: 'To Unicode' },
        ],
        run: (action, values) => ({
            output: action === 'to-unicode' ? decodePunycode(values.input) : encodePunycode(values.input),
        }),
    },
    {
        id: 'gzip',
        label: 'Gzip Compress',
        description: 'Compress or decompress gzip Base64',
        command: 'devx.gzipTool',
        icon: 'gzip.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Gzip UTF-8 text to Base64, or gunzip a Base64 payload. Expanded output is limited to 10 MB.',
        fields: [{ id: 'input', label: 'Text or Base64 gzip', kind: 'textarea', rows: 8 }],
        actions: [
            { id: 'compress', label: 'Compress' },
            { id: 'decompress', label: 'Decompress' },
        ],
        run: (action, values) => {
            if (action === 'decompress') {
                const result = gzipDecompress(requireText(values.input, 'Input'));
                return { output: result.text, notice: result.notice };
            }
            const result = gzipCompress(requireText(values.input, 'Input'));
            return { output: result.base64, notice: result.notice };
        },
    },
    {
        id: 'data-uri',
        label: 'Data URI',
        description: 'Build or read a text data URI',
        command: 'devx.dataUriTool',
        icon: 'data-uri.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Create a Base64 data URI from text, or decode a text data URI. Binary previews are decoded as UTF-8.',
        fields: [
            { id: 'input', label: 'Text or data URI', kind: 'textarea', rows: 8 },
            {
                id: 'mime',
                label: 'MIME type',
                kind: 'text',
                defaultValue: 'text/plain;charset=utf-8',
                placeholder: 'text/plain;charset=utf-8',
            },
        ],
        actions: [
            { id: 'encode', label: 'Encode' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => {
            if (action === 'decode') {
                const result = decodeDataUri(requireText(values.input, 'Data URI'));
                return { output: result.text, notice: result.notice };
            }
            return { output: encodeDataUri(requireText(values.input, 'Text'), values.mime || 'text/plain;charset=utf-8') };
        },
    },
    {
        id: 'query',
        label: 'Query String',
        description: 'Convert query strings and JSON',
        command: 'devx.queryStringTool',
        icon: 'query.svg',
        defaultVisible: true,
        category: 'Encode',
        summary: 'Parse a URL query string into JSON. Repeated keys become arrays. Build a query from a flat JSON object.',
        fields: [{ id: 'input', label: 'Query string or JSON', kind: 'textarea', rows: 8, placeholder: 'a=1&b=2' }],
        actions: [
            { id: 'parse', label: 'Parse to JSON' },
            { id: 'build', label: 'Build query' },
        ],
        run: (action, values) => {
            const input = requireText(values.input, 'Input');
            try {
                return { output: action === 'build' ? buildQuery(input) : parseQuery(input) };
            } catch (error) {
                if (error instanceof SyntaxError) {
                    throw new Error('Build expects a JSON object.');
                }
                throw error;
            }
        },
    },
];
