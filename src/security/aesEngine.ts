import * as crypto from 'crypto';

export type AesDataEncoding = 'utf8' | 'hex' | 'base64';
export type AesMode = 'CBC' | 'CFB' | 'CTR' | 'OFB' | 'ECB';
export type AesPadding = 'Pkcs7' | 'Iso97971' | 'AnsiX923' | 'Iso10126' | 'ZeroPadding' | 'NoPadding';
export type AesKeyType = 'custom' | 'PBKDF2' | 'EvpKDF';
export type AesHash = 'MD5' | 'SHA1' | 'SHA224' | 'SHA256' | 'SHA384' | 'SHA512' | 'RIPEMD160';
export type AesSaltType = 'random' | 'nosalt' | 'custom';
export type AesKeySize = 128 | 192 | 256;

export interface AesOperationSettings {
    keySize: AesKeySize;
    mode: AesMode;
    padding: AesPadding;
    keyType: AesKeyType;
    hash: AesHash;
    customIteration: boolean;
    iteration: number;
    passphrase: string;
    key: string;
    keyEncoding: AesDataEncoding;
    iv: string;
    ivEncoding: AesDataEncoding;
    saltType: AesSaltType;
    salt: string;
    saltEncoding: AesDataEncoding;
}

const AES_BLOCK_SIZE = 16;
const SALTED_PREFIX = Buffer.from('Salted__', 'ascii');
const SALT_SIZE_BYTES = 8;
const BLOCK_MODES = new Set<AesMode>(['CBC', 'ECB']);
const PADDING_FOR_BLOCK_MODES = new Set<AesPadding>([
    'Pkcs7',
    'Iso97971',
    'AnsiX923',
    'Iso10126',
    'ZeroPadding',
    'NoPadding',
]);

const HASH_ALGORITHM: Record<AesHash, string> = {
    MD5: 'md5',
    SHA1: 'sha1',
    SHA224: 'sha224',
    SHA256: 'sha256',
    SHA384: 'sha384',
    SHA512: 'sha512',
    RIPEMD160: 'ripemd160',
};

export function decodeData(value: string, encoding: AesDataEncoding, fieldName: string): Buffer {
    switch (encoding) {
        case 'utf8':
            return Buffer.from(value, 'utf8');
        case 'hex': {
            const normalized = value.replace(/\s+/g, '');
            if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
                throw new Error(`${fieldName} must be valid hex data.`);
            }
            return Buffer.from(normalized, 'hex');
        }
        case 'base64': {
            const normalized = value.replace(/\s+/g, '');
            if (normalized.length === 0) {
                return Buffer.alloc(0);
            }
            if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
                throw new Error(`${fieldName} must be valid base64 data.`);
            }
            return Buffer.from(normalized, 'base64');
        }
        default:
            throw new Error(`Unsupported encoding: ${encoding}`);
    }
}

export function encodeData(value: Buffer, encoding: AesDataEncoding): string {
    switch (encoding) {
        case 'utf8':
            return value.toString('utf8');
        case 'hex':
            return value.toString('hex');
        case 'base64':
            return value.toString('base64');
        default:
            throw new Error(`Unsupported encoding: ${encoding}`);
    }
}

export function encryptAes(input: Buffer, settings: AesOperationSettings): Buffer {
    validateSettings(settings);
    const { key, iv, salt } = resolveKeyMaterialForEncrypt(settings);
    const algorithm = getAlgorithm(settings.keySize, settings.mode);
    const shouldUseBlockPadding = BLOCK_MODES.has(settings.mode);
    const effectivePadding = shouldUseBlockPadding ? settings.padding : 'NoPadding';
    const payload = shouldUseBlockPadding ? applyPadding(input, effectivePadding, AES_BLOCK_SIZE) : input;
    const cipher = crypto.createCipheriv(algorithm, key, settings.mode === 'ECB' ? null : iv);
    cipher.setAutoPadding(shouldUseBlockPadding && effectivePadding === 'Pkcs7');
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);

    if (settings.keyType !== 'custom' && salt) {
        return Buffer.concat([SALTED_PREFIX, salt, encrypted]);
    }

    return encrypted;
}

export function decryptAes(input: Buffer, settings: AesOperationSettings): Buffer {
    validateSettings(settings);

    let cipherText = input;
    let derivedSalt: Buffer | null = null;

    if (settings.keyType !== 'custom') {
        const parsed = parseSaltedCiphertext(input);
        cipherText = parsed.ciphertext;
        derivedSalt = parsed.salt;
    }

    const { key, iv } = resolveKeyMaterialForDecrypt(settings, derivedSalt);
    const algorithm = getAlgorithm(settings.keySize, settings.mode);
    const shouldUseBlockPadding = BLOCK_MODES.has(settings.mode);
    const effectivePadding = shouldUseBlockPadding ? settings.padding : 'NoPadding';

    if (shouldUseBlockPadding && cipherText.length % AES_BLOCK_SIZE !== 0) {
        throw new Error(`Message must be multiple of ${AES_BLOCK_SIZE * 8} bits.`);
    }

    const decipher = crypto.createDecipheriv(algorithm, key, settings.mode === 'ECB' ? null : iv);
    decipher.setAutoPadding(shouldUseBlockPadding && effectivePadding === 'Pkcs7');

    let decrypted: Buffer;
    try {
        decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    } catch (error) {
        throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!shouldUseBlockPadding || effectivePadding === 'Pkcs7') {
        return decrypted;
    }

    return removePadding(decrypted, effectivePadding, AES_BLOCK_SIZE);
}

function getAlgorithm(keySize: AesKeySize, mode: AesMode): string {
    return `aes-${keySize}-${mode.toLowerCase()}`;
}

function validateSettings(settings: AesOperationSettings): void {
    if (settings.keyType !== 'custom') {
        if (!settings.passphrase) {
            throw new Error('Passphrase is required for PBKDF2/EvpKDF key types.');
        }
        if (!Number.isInteger(settings.iteration) || settings.iteration < 1) {
            throw new Error('Iteration must be a positive integer.');
        }
    }

    if (BLOCK_MODES.has(settings.mode) && !PADDING_FOR_BLOCK_MODES.has(settings.padding)) {
        throw new Error(`Unsupported padding: ${settings.padding}`);
    }
}

function resolveKeyMaterialForEncrypt(settings: AesOperationSettings): {
    key: Buffer;
    iv: Buffer;
    salt: Buffer | null;
} {
    if (settings.keyType === 'custom') {
        const custom = resolveCustomKeyMaterial(settings);
        return {
            key: custom.key,
            iv: custom.iv,
            salt: null,
        };
    }

    const salt = resolveEncryptSalt(settings);
    const { key, iv } = resolveDerivedKeyMaterial(settings, salt);
    return { key, iv, salt };
}

function resolveKeyMaterialForDecrypt(
    settings: AesOperationSettings,
    parsedSalt: Buffer | null
): {
    key: Buffer;
    iv: Buffer;
} {
    if (settings.keyType === 'custom') {
        const { key, iv } = resolveCustomKeyMaterial(settings);
        return { key, iv };
    }

    const salt =
        parsedSalt ??
        (settings.saltType === 'custom' ? decodeData(settings.salt, settings.saltEncoding, 'Custom salt') : null);
    if (salt && salt.length !== SALT_SIZE_BYTES) {
        throw new Error('Salt must be 64 bits (8 bytes).');
    }
    return resolveDerivedKeyMaterial(settings, salt);
}

function resolveCustomKeyMaterial(settings: AesOperationSettings): { key: Buffer; iv: Buffer } {
    const expectedKeyBytes = settings.keySize / 8;
    const key = decodeData(settings.key, settings.keyEncoding, 'Key');
    if (key.length !== expectedKeyBytes) {
        throw new Error(`Key must be ${settings.keySize} bits.`);
    }

    if (settings.mode === 'ECB') {
        return { key, iv: Buffer.alloc(0) };
    }

    const iv = decodeData(settings.iv, settings.ivEncoding, 'IV');
    if (iv.length !== AES_BLOCK_SIZE) {
        throw new Error('IV must be 128 bits.');
    }

    return { key, iv };
}

function resolveEncryptSalt(settings: AesOperationSettings): Buffer | null {
    if (settings.keyType === 'custom') {
        return null;
    }

    switch (settings.saltType) {
        case 'random':
            return crypto.randomBytes(SALT_SIZE_BYTES);
        case 'nosalt':
            return null;
        case 'custom': {
            const salt = decodeData(settings.salt, settings.saltEncoding, 'Custom salt');
            if (salt.length !== SALT_SIZE_BYTES) {
                throw new Error('Salt must be 64 bits (8 bytes).');
            }
            return salt;
        }
        default:
            throw new Error(`Unsupported salt type: ${settings.saltType}`);
    }
}

function resolveDerivedKeyMaterial(
    settings: AesOperationSettings,
    salt: Buffer | null
): { key: Buffer; iv: Buffer } {
    const keyBytes = settings.keySize / 8;
    const ivBytes = AES_BLOCK_SIZE;
    const totalBytes = keyBytes + ivBytes;
    const iterations =
        settings.customIteration || settings.keyType === 'custom'
            ? settings.iteration
            : settings.keyType === 'PBKDF2'
              ? 10000
              : 1;
    const digest = HASH_ALGORITHM[settings.hash];
    const passphrase = Buffer.from(settings.passphrase, 'utf8');
    const saltBuffer = salt ?? Buffer.alloc(0);

    let derived: Buffer;
    if (settings.keyType === 'PBKDF2') {
        derived = crypto.pbkdf2Sync(passphrase, saltBuffer, iterations, totalBytes, digest);
    } else {
        derived = evpKdf(passphrase, salt, totalBytes, iterations, digest);
    }

    return {
        key: derived.subarray(0, keyBytes),
        iv: derived.subarray(keyBytes, keyBytes + ivBytes),
    };
}

function evpKdf(passphrase: Buffer, salt: Buffer | null, totalBytes: number, iterations: number, digest: string): Buffer {
    let derived = Buffer.alloc(0);
    let block = Buffer.alloc(0);

    while (derived.length < totalBytes) {
        let hash = crypto.createHash(digest);
        hash.update(block);
        hash.update(passphrase);
        if (salt) {
            hash.update(salt);
        }
        block = hash.digest();

        for (let i = 1; i < iterations; i++) {
            hash = crypto.createHash(digest);
            hash.update(block);
            block = hash.digest();
        }

        derived = Buffer.concat([derived, block]);
    }

    return derived.subarray(0, totalBytes);
}

function applyPadding(input: Buffer, padding: AesPadding, blockSize: number): Buffer {
    const remainder = input.length % blockSize;
    if (padding === 'NoPadding') {
        if (remainder !== 0) {
            throw new Error(`Message must be multiple of ${blockSize * 8} bits.`);
        }
        return input;
    }

    if (padding === 'Pkcs7') {
        return input;
    }

    if (padding === 'ZeroPadding') {
        if (remainder === 0) {
            return input;
        }
        return Buffer.concat([input, Buffer.alloc(blockSize - remainder, 0x00)]);
    }

    const padLength = remainder === 0 ? blockSize : blockSize - remainder;
    switch (padding) {
        case 'Iso97971':
            return Buffer.concat([input, Buffer.from([0x80]), Buffer.alloc(padLength - 1, 0x00)]);
        case 'AnsiX923':
            return Buffer.concat([input, Buffer.alloc(padLength - 1, 0x00), Buffer.from([padLength])]);
        case 'Iso10126':
            return Buffer.concat([
                input,
                padLength > 1 ? crypto.randomBytes(padLength - 1) : Buffer.alloc(0),
                Buffer.from([padLength]),
            ]);
        default:
            throw new Error(`Unsupported padding: ${padding}`);
    }
}

function removePadding(input: Buffer, padding: AesPadding, blockSize: number): Buffer {
    if (padding === 'NoPadding') {
        return input;
    }

    if (padding === 'ZeroPadding') {
        let end = input.length;
        while (end > 0 && input[end - 1] === 0x00) {
            end -= 1;
        }
        return input.subarray(0, end);
    }

    if (input.length === 0 || input.length % blockSize !== 0) {
        throw new Error('bad decrypt');
    }

    if (padding === 'Iso97971') {
        let end = input.length;
        while (end > 0 && input[end - 1] === 0x00) {
            end -= 1;
        }
        if (end === 0 || input[end - 1] !== 0x80) {
            throw new Error('bad decrypt');
        }
        return input.subarray(0, end - 1);
    }

    const padLength = input[input.length - 1];
    if (padLength < 1 || padLength > blockSize || padLength > input.length) {
        throw new Error('bad decrypt');
    }

    if (padding === 'AnsiX923') {
        for (let i = input.length - padLength; i < input.length - 1; i++) {
            if (input[i] !== 0x00) {
                throw new Error('bad decrypt');
            }
        }
    }

    return input.subarray(0, input.length - padLength);
}

function parseSaltedCiphertext(input: Buffer): { salt: Buffer | null; ciphertext: Buffer } {
    if (input.length >= 16 && input.subarray(0, 8).equals(SALTED_PREFIX)) {
        return {
            salt: input.subarray(8, 16),
            ciphertext: input.subarray(16),
        };
    }

    return {
        salt: null,
        ciphertext: input,
    };
}
