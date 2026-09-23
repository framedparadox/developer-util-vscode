import * as crypto from 'crypto';
import * as fs from 'fs';
import { choice, readInteger, requireText } from './common';
import { decodeBase32, encodeBase32 } from './encodeTools';
import type { UtilityResult, UtilityTool } from './types';

export const HASH_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'] as const;
const HMAC_ALGORITHMS = ['sha256', 'sha384', 'sha512', 'sha1'] as const;
export const FILE_HASH_LIMIT = 50 * 1024 * 1024;

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const AMBIGUOUS = 'iloIO01|';

export function hashText(value: string): string {
    return HASH_ALGORITHMS.map((algorithm) => `${algorithm.padEnd(12, ' ')} ${crypto.createHash(algorithm).update(value, 'utf8').digest('hex')}`).join('\n');
}

export async function hashFile(filePath: string, algorithm: string): Promise<string> {
    if (!HASH_ALGORITHMS.includes(algorithm as (typeof HASH_ALGORITHMS)[number])) {
        throw new Error('Unsupported hash algorithm.');
    }
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
        throw new Error('Choose a file to checksum.');
    }
    if (stat.size > FILE_HASH_LIMIT) {
        throw new Error('File exceeds the 50 MB checksum limit.');
    }
    const hash = crypto.createHash(algorithm);
    await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve());
    });
    return `${algorithm}  ${hash.digest('hex')}  ${filePath}`;
}

export function hmacText(value: string, key: string, algorithm: string): string {
    const selected = choice(algorithm, 'algorithm', HMAC_ALGORITHMS, 'sha256');
    return crypto.createHmac(selected, key).update(value, 'utf8').digest('hex');
}

export function generatePassword(length: number, sets: { lower: boolean; upper: boolean; digits: boolean; symbols: boolean; ambiguous: boolean }): string {
    const pools = [
        sets.lower ? LOWER + (sets.ambiguous ? 'ilo' : '') : '',
        sets.upper ? UPPER + (sets.ambiguous ? 'IO' : '') : '',
        sets.digits ? DIGITS + (sets.ambiguous ? '01' : '') : '',
        sets.symbols ? SYMBOLS + (sets.ambiguous ? '|' : '') : '',
    ].filter(Boolean);
    if (pools.length === 0) {
        throw new Error('Select at least one character set.');
    }
    if (length < pools.length) {
        throw new Error('Length must be at least the number of selected character sets.');
    }
    const all = pools.join('');
    const chars = pools.map((pool) => pool[crypto.randomInt(pool.length)]);
    while (chars.length < length) {
        chars.push(all[crypto.randomInt(all.length)]);
    }
    for (let index = chars.length - 1; index > 0; index -= 1) {
        const swap = crypto.randomInt(index + 1);
        [chars[index], chars[swap]] = [chars[swap], chars[index]];
    }
    return chars.join('');
}

export function generateToken(bytes: number, encoding: string): string {
    const buffer = crypto.randomBytes(bytes);
    if (encoding === 'base64') {
        return buffer.toString('base64');
    }
    if (encoding === 'base64url') {
        return buffer.toString('base64url');
    }
    return buffer.toString('hex');
}

export function hashScrypt(password: string, cost = 16384): string {
    if (!password) {
        throw new Error('Password is required.');
    }
    if (cost !== 1024 && cost !== 16384 && cost !== 32768) {
        throw new Error('Unsupported scrypt cost.');
    }
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 32, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return `scrypt$${cost}$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyScrypt(password: string, encoded: string): boolean {
    const parts = encoded.trim().split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
        throw new Error('Hash must look like scrypt$N$r$p$salt$hash.');
    }
    const cost = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (![1024, 16384, 32768].includes(cost) || r !== 8 || p !== 1) {
        throw new Error('Unsupported scrypt parameters.');
    }
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function generateKeyPair(kind: string): string {
    if (kind === 'rsa-3072' || kind === 'rsa-2048') {
        const modulusLength = kind === 'rsa-3072' ? 3072 : 2048;
        const pair = crypto.generateKeyPairSync('rsa', {
            modulusLength,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        return `${pair.privateKey}${pair.publicKey}`;
    }
    const pair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return `${pair.privateKey}${pair.publicKey}`;
}

export function totpAt(secret: string, timeMs: number, digits: number, period: number, algorithm: string): string {
    const key = decodeBase32(secret.replace(/\s+/g, ''));
    if (key.length === 0) {
        throw new Error('Secret is required.');
    }
    const counter = BigInt(Math.floor(timeMs / 1000 / period));
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(counter);
    const hmac = crypto.createHmac(algorithm, key).update(counterBytes).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
    return String(binary % 10 ** digits).padStart(digits, '0');
}

export function signJwt(payloadText: string, secret: string, algorithm: string): string {
    if (!secret) {
        throw new Error('Secret is required.');
    }
    let payload: unknown;
    try {
        payload = JSON.parse(payloadText);
    } catch {
        throw new Error('Payload must be JSON.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Payload must be a JSON object.');
    }
    const selected = choice(algorithm, 'algorithm', ['HS256', 'HS384', 'HS512'], 'HS256');
    const hash = selected === 'HS512' ? 'sha512' : selected === 'HS384' ? 'sha384' : 'sha256';
    const header = Buffer.from(JSON.stringify({ alg: selected, typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac(hash, secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

export function basicAuth(username: string, password: string): string {
    const user = requireText(username, 'Username');
    return `Authorization: Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

function yes(value: string | undefined): boolean {
    return (value ?? 'true') !== 'false';
}

export const cryptoTools: UtilityTool[] = [
    {
        id: 'hash',
        label: 'Hash Generator',
        description: 'MD5, SHA, SHA-3, BLAKE2, and RIPEMD-160',
        command: 'devx.hashTool',
        icon: 'hash.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Hash text locally. Checksum a file up to 50 MB. Nothing is sent to a service.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 8 },
            {
                id: 'algorithm',
                label: 'File algorithm',
                kind: 'select',
                options: HASH_ALGORITHMS.map((algorithm) => ({ value: algorithm, label: algorithm })),
                defaultValue: 'sha256',
            },
        ],
        actions: [{ id: 'hash', label: 'Hash text' }],
        fileAction: { id: 'hash-file', label: 'Checksum file' },
        run: (_action, values) => ({ output: hashText(values.input ?? '') }),
    },
    {
        id: 'hmac',
        label: 'HMAC',
        description: 'Keyed hash for a message',
        command: 'devx.hmacTool',
        icon: 'hmac.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Compute an HMAC over UTF-8 text with a local key. The key stays in the extension host.',
        fields: [
            { id: 'input', label: 'Message', kind: 'textarea', rows: 6 },
            { id: 'key', label: 'Key', kind: 'text', placeholder: 'secret' },
            {
                id: 'algorithm',
                label: 'Algorithm',
                kind: 'select',
                options: HMAC_ALGORITHMS.map((algorithm) => ({ value: algorithm, label: algorithm })),
                defaultValue: 'sha256',
            },
        ],
        actions: [{ id: 'hmac', label: 'Compute HMAC' }],
        run: (_action, values) => ({
            output: hmacText(requireText(values.input, 'Message'), values.key ?? '', values.algorithm),
            notice: values.key ? undefined : 'The key is empty.',
        }),
    },
    {
        id: 'password',
        label: 'Password Generator',
        description: 'Generate a cryptographic password',
        command: 'devx.passwordTool',
        icon: 'password.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Passwords come from crypto.randomInt. Ambiguous characters are omitted unless you opt in.',
        fields: [
            { id: 'length', label: 'Length', kind: 'number', defaultValue: '20' },
            {
                id: 'lower',
                label: 'Lowercase',
                kind: 'select',
                options: [
                    { value: 'true', label: 'Include' },
                    { value: 'false', label: 'Omit' },
                ],
                defaultValue: 'true',
            },
            {
                id: 'upper',
                label: 'Uppercase',
                kind: 'select',
                options: [
                    { value: 'true', label: 'Include' },
                    { value: 'false', label: 'Omit' },
                ],
                defaultValue: 'true',
            },
            {
                id: 'digits',
                label: 'Digits',
                kind: 'select',
                options: [
                    { value: 'true', label: 'Include' },
                    { value: 'false', label: 'Omit' },
                ],
                defaultValue: 'true',
            },
            {
                id: 'symbols',
                label: 'Symbols',
                kind: 'select',
                options: [
                    { value: 'true', label: 'Include' },
                    { value: 'false', label: 'Omit' },
                ],
                defaultValue: 'true',
            },
            {
                id: 'ambiguous',
                label: 'Ambiguous (0, O, 1, l, |)',
                kind: 'select',
                options: [
                    { value: 'false', label: 'Omit' },
                    { value: 'true', label: 'Include' },
                ],
                defaultValue: 'false',
            },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({
            output: generatePassword(readInteger(values.length, 'Length', 8, 128), {
                lower: yes(values.lower),
                upper: yes(values.upper),
                digits: yes(values.digits),
                symbols: yes(values.symbols),
                ambiguous: yes(values.ambiguous) && values.ambiguous === 'true',
            }),
        }),
    },
    {
        id: 'token',
        label: 'Random Token',
        description: 'Generate random hex or Base64 bytes',
        command: 'devx.tokenTool',
        icon: 'token.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Generate a token from cryptographic random bytes.',
        fields: [
            { id: 'bytes', label: 'Bytes', kind: 'number', defaultValue: '32' },
            {
                id: 'encoding',
                label: 'Encoding',
                kind: 'select',
                options: [
                    { value: 'hex', label: 'Hex' },
                    { value: 'base64', label: 'Base64' },
                    { value: 'base64url', label: 'Base64URL' },
                ],
                defaultValue: 'hex',
            },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({
            output: generateToken(readInteger(values.bytes, 'Bytes', 8, 128), choice(values.encoding, 'encoding', ['hex', 'base64', 'base64url'], 'hex')),
        }),
    },
    {
        id: 'scrypt',
        label: 'Password Hasher',
        description: 'Hash or verify with scrypt',
        command: 'devx.scryptTool',
        icon: 'scrypt.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Create or check a local scrypt hash. This is not a bcrypt string. Parameters stay inside the safe Node defaults.',
        fields: [
            { id: 'password', label: 'Password', kind: 'text' },
            { id: 'hash', label: 'Existing hash', kind: 'textarea', rows: 4, placeholder: 'scrypt$16384$8$1$...' },
            {
                id: 'cost',
                label: 'Cost (N)',
                kind: 'select',
                options: [
                    { value: '16384', label: '16384' },
                    { value: '32768', label: '32768' },
                ],
                defaultValue: '16384',
            },
        ],
        actions: [
            { id: 'hash', label: 'Hash' },
            { id: 'verify', label: 'Verify' },
        ],
        run: (action, values) => {
            if (action === 'verify') {
                const valid = verifyScrypt(values.password ?? '', requireText(values.hash, 'Hash'));
                return { output: valid ? 'Match' : 'No match' };
            }
            const cost = Number(choice(values.cost, 'cost', ['16384', '32768'], '16384'));
            return { output: hashScrypt(values.password ?? '', cost) };
        },
    },
    {
        id: 'keypair',
        label: 'Key Pair Generator',
        description: 'Generate Ed25519 or RSA PEM keys',
        command: 'devx.keyPairTool',
        icon: 'keypair.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Keys are generated in the extension host and shown only in this panel. Copy the private key somewhere you control before closing it.',
        fields: [
            {
                id: 'kind',
                label: 'Algorithm',
                kind: 'select',
                options: [
                    { value: 'ed25519', label: 'Ed25519' },
                    { value: 'rsa-2048', label: 'RSA 2048' },
                    { value: 'rsa-3072', label: 'RSA 3072' },
                ],
                defaultValue: 'ed25519',
            },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({
            output: generateKeyPair(choice(values.kind, 'algorithm', ['ed25519', 'rsa-2048', 'rsa-3072'], 'ed25519')),
            notice: 'Private key material stays in this panel.',
        }),
    },
    {
        id: 'totp',
        label: 'TOTP',
        description: 'Generate a time-based one-time code',
        command: 'devx.totpTool',
        icon: 'totp.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'RFC 6238 codes from a Base32 secret. Codes are calculated locally for the current time step.',
        fields: [
            { id: 'secret', label: 'Base32 secret', kind: 'text', placeholder: 'GEZDGNBVGY3TQOJQ' },
            { id: 'account', label: 'Account label', kind: 'text', defaultValue: 'user' },
            {
                id: 'digits',
                label: 'Digits',
                kind: 'select',
                options: [
                    { value: '6', label: '6' },
                    { value: '8', label: '8' },
                ],
                defaultValue: '6',
            },
            {
                id: 'algorithm',
                label: 'Algorithm',
                kind: 'select',
                options: [
                    { value: 'sha1', label: 'SHA-1' },
                    { value: 'sha256', label: 'SHA-256' },
                    { value: 'sha512', label: 'SHA-512' },
                ],
                defaultValue: 'sha1',
            },
        ],
        actions: [
            { id: 'code', label: 'Current code' },
            { id: 'secret', label: 'New secret' },
        ],
        run: (action, values) => formatTotp(action, values),
    },
    {
        id: 'basic-auth',
        label: 'Basic Auth Header',
        description: 'Build an HTTP Basic Authorization header',
        command: 'devx.basicAuthTool',
        icon: 'basic-auth.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Encode username:password as a Basic authorization header. The value is only rendered in this panel.',
        fields: [
            { id: 'username', label: 'Username', kind: 'text' },
            { id: 'password', label: 'Password', kind: 'text' },
        ],
        actions: [{ id: 'build', label: 'Build header' }],
        run: (_action, values) => ({ output: basicAuth(values.username ?? '', values.password ?? '') }),
    },
    {
        id: 'jwt-sign',
        label: 'JWT Signer',
        description: 'Sign a JSON payload with HMAC',
        command: 'devx.jwtSignTool',
        icon: 'jwt.svg',
        defaultVisible: true,
        category: 'Crypto',
        summary: 'Create an HS256, HS384, or HS512 token locally. Signing does not prove that a third party issued the token. The debugger still does not verify signatures.',
        fields: [
            {
                id: 'payload',
                label: 'Payload JSON',
                kind: 'textarea',
                rows: 8,
                placeholder: '{\n  "sub": "1234567890"\n}',
            },
            { id: 'secret', label: 'Secret', kind: 'text' },
            {
                id: 'algorithm',
                label: 'Algorithm',
                kind: 'select',
                options: [
                    { value: 'HS256', label: 'HS256' },
                    { value: 'HS384', label: 'HS384' },
                    { value: 'HS512', label: 'HS512' },
                ],
                defaultValue: 'HS256',
            },
        ],
        actions: [{ id: 'sign', label: 'Sign' }],
        run: (_action, values) => ({
            output: signJwt(requireText(values.payload, 'Payload'), values.secret ?? '', values.algorithm),
            notice: 'Token created locally with the secret in this panel.',
        }),
    },
];

function formatTotp(action: string, values: Record<string, string>): UtilityResult {
    const digits = Number(choice(values.digits, 'digits', ['6', '8'], '6'));
    const algorithm = choice(values.algorithm, 'algorithm', ['sha1', 'sha256', 'sha512'], 'sha1');
    const period = 30;
    if (action === 'secret') {
        const secret = encodeBase32(crypto.randomBytes(20)).replace(/=+$/g, '');
        const code = totpAt(secret, Date.now(), digits, period, algorithm);
        const account = encodeURIComponent((values.account || 'user').trim() || 'user');
        const uri = `otpauth://totp/Developer%20Utilities:${account}?secret=${secret}&issuer=Developer%20Utilities&algorithm=${algorithm.toUpperCase()}&digits=${digits}&period=${period}`;
        return { output: `Secret: ${secret}\nCode: ${code}\n${uri}`, notice: `${period - (Math.floor(Date.now() / 1000) % period)}s left in this step.` };
    }
    const now = Date.now();
    const code = totpAt(requireText(values.secret, 'Secret'), now, digits, period, algorithm);
    const previous = totpAt(values.secret, now - period * 1000, digits, period, algorithm);
    const next = totpAt(values.secret, now + period * 1000, digits, period, algorithm);
    return {
        output: `Current:  ${code}\nPrevious: ${previous}\nNext:     ${next}`,
        notice: `${period - (Math.floor(now / 1000) % period)}s left in this step.`,
    };
}
