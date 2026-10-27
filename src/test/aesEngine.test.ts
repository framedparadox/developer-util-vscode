import * as assert from 'assert';
import * as crypto from 'crypto';
import { AesOperationSettings, decodeData, decryptAes, encodeData, encryptAes } from '../security/aesEngine';

function createSettings(overrides: Partial<AesOperationSettings> = {}): AesOperationSettings {
    return {
        keySize: 256,
        mode: 'CBC',
        padding: 'Pkcs7',
        keyType: 'PBKDF2',
        hash: 'SHA256',
        customIteration: true,
        iteration: 5,
        passphrase: 'correct horse battery staple',
        key: '',
        keyEncoding: 'hex',
        iv: '',
        ivEncoding: 'hex',
        saltType: 'random',
        salt: '',
        saltEncoding: 'hex',
        ...overrides,
    };
}

function customKeySettings(
    keySize: 128 | 192 | 256 = 256,
    mode: 'CBC' | 'CFB' | 'CTR' | 'OFB' | 'ECB' = 'CBC',
): AesOperationSettings {
    const keyHex = crypto.randomBytes(keySize / 8).toString('hex');
    const ivHex = crypto.randomBytes(16).toString('hex');
    return createSettings({
        keyType: 'custom',
        keySize,
        mode,
        keyEncoding: 'hex',
        ivEncoding: 'hex',
        key: keyHex,
        iv: ivHex,
    });
}

const availableCiphers = new Set(crypto.getCiphers());
const isCipherSupported = (keySize: 128 | 192 | 256, mode: string) =>
    availableCiphers.has(`aes-${keySize}-${mode.toLowerCase()}`);

// ─── decodeData ──────────────────────────────────────────────────────────────

suite('decodeData', () => {
    test('utf8: round-trips plain text', () => {
        const text = 'Hello, World!';
        const buf = decodeData(text, 'utf8', 'test');
        assert.strictEqual(buf.toString('utf8'), text);
    });

    test('utf8: returns empty buffer for empty string', () => {
        assert.strictEqual(decodeData('', 'utf8', 'test').length, 0);
    });

    test('hex: decodes lowercase hex', () => {
        const buf = decodeData('deadbeef', 'hex', 'test');
        assert.strictEqual(buf.toString('hex'), 'deadbeef');
    });

    test('hex: decodes uppercase hex', () => {
        const buf = decodeData('DEADBEEF', 'hex', 'test');
        assert.strictEqual(buf.toString('hex'), 'deadbeef');
    });

    test('hex: strips whitespace before decoding', () => {
        const buf = decodeData('de ad be ef', 'hex', 'test');
        assert.strictEqual(buf.toString('hex'), 'deadbeef');
    });

    test('hex: throws on odd-length hex', () => {
        assert.throws(() => decodeData('abc', 'hex', 'field'), /field must be valid hex/);
    });

    test('hex: throws on non-hex characters', () => {
        assert.throws(() => decodeData('zzzz', 'hex', 'field'), /field must be valid hex/);
    });

    test('base64: decodes valid base64', () => {
        const original = Buffer.from('test payload');
        const b64 = original.toString('base64');
        assert.deepStrictEqual(decodeData(b64, 'base64', 'test'), original);
    });

    test('base64: returns empty buffer for empty string', () => {
        assert.strictEqual(decodeData('', 'base64', 'test').length, 0);
    });

    test('base64: throws on invalid base64', () => {
        assert.throws(() => decodeData('!!!', 'base64', 'field'), /field must be valid base64/);
    });

    test('base64: throws on incorrect padding', () => {
        assert.throws(() => decodeData('YQ', 'base64', 'field'), /field must be valid base64/);
    });
});

// ─── encodeData ──────────────────────────────────────────────────────────────

suite('encodeData', () => {
    const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    test('hex: produces lowercase hex string', () => {
        assert.strictEqual(encodeData(buf, 'hex'), 'deadbeef');
    });

    test('base64: produces valid base64 string', () => {
        assert.strictEqual(encodeData(buf, 'base64'), buf.toString('base64'));
    });

    test('utf8: produces utf8 string', () => {
        const text = Buffer.from('hello');
        assert.strictEqual(encodeData(text, 'utf8'), 'hello');
    });
});

// ─── AES round-trip: key sizes × modes ──────────────────────────────────────

suite('AES Engine – key sizes and modes', () => {
    const keySizes = [128, 192, 256] as const;
    const blockModes = ['CBC', 'ECB'] as const;
    const streamModes = ['CFB', 'CTR', 'OFB'] as const;
    const plaintext = Buffer.from('Round-trip test payload for AES!', 'utf8');

    for (const keySize of keySizes) {
        for (const mode of blockModes) {
            if (!isCipherSupported(keySize, mode)) {
                continue;
            }

            test(`round-trip: ${keySize}-bit ${mode} with custom key (Pkcs7)`, () => {
                const settings = customKeySettings(keySize, mode);
                const encrypted = encryptAes(plaintext, settings);
                const decrypted = decryptAes(encrypted, settings);
                assert.deepStrictEqual(decrypted, plaintext);
            });
        }

        for (const mode of streamModes) {
            if (!isCipherSupported(keySize, mode)) {
                continue;
            }

            test(`round-trip: ${keySize}-bit ${mode} with custom key (stream mode)`, () => {
                const settings = customKeySettings(keySize, mode);
                const encrypted = encryptAes(plaintext, settings);
                const decrypted = decryptAes(encrypted, settings);
                assert.deepStrictEqual(decrypted, plaintext);
            });
        }
    }
});

// ─── AES round-trip: all paddings ────────────────────────────────────────────

suite('AES Engine – padding schemes', () => {
    const blockAligned = Buffer.from('0011223344556677', 'hex'); // exactly 8 bytes, needs padding to 16
    const nonAligned = Buffer.from('Hello, World!', 'utf8'); // 13 bytes

    const paddings = ['Pkcs7', 'Iso97971', 'AnsiX923', 'Iso10126', 'ZeroPadding'] as const;

    for (const padding of paddings) {
        test(`round-trip with padding=${padding}`, () => {
            const settings = customKeySettings(256, 'CBC');
            settings.padding = padding;

            const encrypted = encryptAes(nonAligned, settings);
            const decrypted = decryptAes(encrypted, settings);
            assert.deepStrictEqual(decrypted, nonAligned, `Failed padding=${padding}`);
        });
    }

    test('NoPadding: round-trips block-aligned input', () => {
        const aligned = Buffer.alloc(32, 0xab);
        const settings = customKeySettings(256, 'CBC');
        settings.padding = 'NoPadding';
        const encrypted = encryptAes(aligned, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, aligned);
    });

    test('NoPadding: throws on non-block-aligned input', () => {
        const settings = customKeySettings(256, 'CBC');
        settings.padding = 'NoPadding';
        assert.throws(() => encryptAes(Buffer.from('not aligned', 'utf8'), settings), /Message must be multiple/);
    });

    test('ZeroPadding: block-aligned input is unchanged', () => {
        const aligned = Buffer.alloc(16, 0x41); // 16 'A' bytes
        const settings = customKeySettings(256, 'CBC');
        settings.padding = 'ZeroPadding';
        const encrypted = encryptAes(aligned, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, aligned);
    });
});

// ─── AES round-trip: all hash algorithms ─────────────────────────────────────

suite('AES Engine – hash algorithms', () => {
    const hashes = ['MD5', 'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512', 'RIPEMD160'] as const;
    const input = Buffer.from('hash-algo-test', 'utf8');

    for (const hash of hashes) {
        test(`round-trip with hash=${hash}`, () => {
            const settings = createSettings({
                hash,
                keyType: 'PBKDF2',
                saltType: 'custom',
                salt: '0102030405060708',
                saltEncoding: 'hex',
                customIteration: true,
                iteration: 1,
            });
            const encrypted = encryptAes(input, settings);
            const decrypted = decryptAes(encrypted, settings);
            assert.deepStrictEqual(decrypted, input, `Failed hash=${hash}`);
        });
    }
});

// ─── Salt handling ────────────────────────────────────────────────────────────

suite('AES Engine – salt handling', () => {
    const input = Buffer.from('salt-handling-payload', 'utf8');

    test('random salt: output starts with Salted__ prefix', () => {
        const settings = createSettings({ saltType: 'random', customIteration: true, iteration: 1 });
        const encrypted = encryptAes(input, settings);
        assert.strictEqual(encrypted.subarray(0, 8).toString('ascii'), 'Salted__');
    });

    test('random salt: round-trips correctly', () => {
        const settings = createSettings({ saltType: 'random', customIteration: true, iteration: 1 });
        const encrypted = encryptAes(input, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, input);
    });

    test('nosalt: output does NOT have Salted__ prefix', () => {
        const settings = createSettings({ saltType: 'nosalt', customIteration: true, iteration: 1 });
        const encrypted = encryptAes(input, settings);
        assert.notStrictEqual(encrypted.subarray(0, 8).toString('ascii'), 'Salted__');
    });

    test('nosalt: round-trips correctly', () => {
        const settings = createSettings({ saltType: 'nosalt', customIteration: true, iteration: 1 });
        const encrypted = encryptAes(input, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, input);
    });

    test('custom salt: embeds salt bytes after Salted__ prefix', () => {
        const saltHex = 'a1a2a3a4a5a6a7a8';
        const settings = createSettings({
            saltType: 'custom',
            salt: saltHex,
            saltEncoding: 'hex',
            customIteration: true,
            iteration: 1,
        });
        const encrypted = encryptAes(input, settings);
        assert.strictEqual(encrypted.subarray(0, 8).toString('ascii'), 'Salted__');
        assert.strictEqual(encrypted.subarray(8, 16).toString('hex'), saltHex);
    });

    test('custom salt: round-trips correctly', () => {
        const settings = createSettings({
            saltType: 'custom',
            salt: 'b1b2b3b4b5b6b7b8',
            saltEncoding: 'hex',
            customIteration: true,
            iteration: 1,
        });
        const encrypted = encryptAes(input, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, input);
    });

    test('custom salt: throws if salt is not exactly 8 bytes', () => {
        const settings = createSettings({
            saltType: 'custom',
            salt: 'aabbccdd', // only 4 bytes
            saltEncoding: 'hex',
        });
        assert.throws(() => encryptAes(input, settings), /Salt must be 64 bits/);
    });

    test('two encryptions with random salt produce different ciphertexts', () => {
        const settings = createSettings({ saltType: 'random', customIteration: true, iteration: 1 });
        const enc1 = encryptAes(input, settings);
        const enc2 = encryptAes(input, settings);
        assert.notStrictEqual(enc1.toString('hex'), enc2.toString('hex'));
    });

    test('custom key: never prepends Salted__ prefix', () => {
        const settings = customKeySettings(256, 'CBC');
        const encrypted = encryptAes(input, settings);
        assert.notStrictEqual(encrypted.subarray(0, 8).toString('ascii'), 'Salted__');
    });
});

// ─── Key derivation: PBKDF2 vs EvpKDF defaults ───────────────────────────────

suite('AES Engine – key derivation', () => {
    const input = Buffer.from('derivation-test', 'utf8');

    test('PBKDF2 default uses 10000 iterations', () => {
        const withDefault = createSettings({
            keyType: 'PBKDF2',
            customIteration: false,
            iteration: 1,
            saltType: 'custom',
            salt: '1112131415161718',
            hash: 'SHA256',
        });
        const withExplicit = createSettings({
            keyType: 'PBKDF2',
            customIteration: true,
            iteration: 10000,
            saltType: 'custom',
            salt: '1112131415161718',
            hash: 'SHA256',
        });
        // ciphertexts differ (random IV per run) but decryption with default must work
        const encDefault = encryptAes(input, withDefault);
        const decFromDefault = decryptAes(encDefault, withDefault);
        assert.deepStrictEqual(decFromDefault, input);

        // explicit 10000 iterations encrypts to same key derivation as default
        const encExplicit = encryptAes(input, withExplicit);
        assert.strictEqual(encDefault.subarray(16).toString('hex'), encExplicit.subarray(16).toString('hex'));
    });

    test('EvpKDF default uses 1 iteration', () => {
        const withDefault = createSettings({
            keyType: 'EvpKDF',
            customIteration: false,
            iteration: 99,
            saltType: 'custom',
            salt: '2122232425262728',
            hash: 'MD5',
        });
        const withExplicit = createSettings({
            keyType: 'EvpKDF',
            customIteration: true,
            iteration: 1,
            saltType: 'custom',
            salt: '2122232425262728',
            hash: 'MD5',
        });
        const encDefault = encryptAes(input, withDefault);
        const encExplicit = encryptAes(input, withExplicit);
        assert.strictEqual(encDefault.subarray(16).toString('hex'), encExplicit.subarray(16).toString('hex'));
    });

    test('PBKDF2 and EvpKDF with same passphrase produce different keys', () => {
        const base = {
            saltType: 'custom' as const,
            salt: 'aabbccddaabbccdd',
            saltEncoding: 'hex' as const,
            customIteration: true as const,
            iteration: 1,
            hash: 'SHA256' as const,
        };
        const pbkdf2Settings = createSettings({ ...base, keyType: 'PBKDF2' });
        const evpSettings = createSettings({ ...base, keyType: 'EvpKDF', hash: 'MD5' });

        const enc1 = encryptAes(input, pbkdf2Settings);
        const enc2 = encryptAes(input, evpSettings);
        // Different ciphertexts (different key derivation)
        assert.notStrictEqual(enc1.subarray(16).toString('hex'), enc2.subarray(16).toString('hex'));
    });

    test('missing passphrase throws for PBKDF2', () => {
        const settings = createSettings({ keyType: 'PBKDF2', passphrase: '' });
        assert.throws(() => encryptAes(input, settings), /Passphrase is required/);
    });

    test('missing passphrase throws for EvpKDF', () => {
        const settings = createSettings({ keyType: 'EvpKDF', passphrase: '' });
        assert.throws(() => encryptAes(input, settings), /Passphrase is required/);
    });

    test('invalid iteration (0) throws', () => {
        const settings = createSettings({ keyType: 'PBKDF2', iteration: 0 });
        assert.throws(() => encryptAes(input, settings), /Iteration must be an integer between/);
    });

    test('invalid iteration (negative) throws', () => {
        const settings = createSettings({ keyType: 'PBKDF2', iteration: -1 });
        assert.throws(() => encryptAes(input, settings), /Iteration must be an integer between/);
    });

    test('excessive iteration count is rejected', () => {
        const settings = createSettings({ keyType: 'PBKDF2', iteration: 1_000_001 });
        assert.throws(() => encryptAes(input, settings), /Iteration must be an integer between/);
    });
});

// ─── Custom key/IV validation ─────────────────────────────────────────────────

suite('AES Engine – custom key/IV validation', () => {
    const input = Buffer.from('validation test', 'utf8');
    const validKey256 = crypto.randomBytes(32).toString('hex');
    const validIv = crypto.randomBytes(16).toString('hex');

    test('wrong key length throws', () => {
        const settings = createSettings({
            keyType: 'custom',
            keySize: 256,
            mode: 'CBC',
            keyEncoding: 'hex',
            ivEncoding: 'hex',
            key: 'aabbccdd', // 4 bytes instead of 32
            iv: validIv,
        });
        assert.throws(() => encryptAes(input, settings), /Key must be 256 bits/);
    });

    test('wrong IV length throws for CBC', () => {
        const settings = createSettings({
            keyType: 'custom',
            keySize: 256,
            mode: 'CBC',
            keyEncoding: 'hex',
            ivEncoding: 'hex',
            key: validKey256,
            iv: 'aabb', // 2 bytes instead of 16
        });
        assert.throws(() => encryptAes(input, settings), /IV must be 128 bits/);
    });

    test('ECB mode ignores IV (no IV error)', () => {
        if (!isCipherSupported(256, 'ECB')) {
            return;
        }
        const aligned = Buffer.alloc(16, 0x42);
        const settings = createSettings({
            keyType: 'custom',
            keySize: 256,
            mode: 'ECB',
            padding: 'NoPadding',
            keyEncoding: 'hex',
            ivEncoding: 'hex',
            key: validKey256,
            iv: '', // ECB needs no IV
        });
        const encrypted = encryptAes(aligned, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, aligned);
    });

    test('wrong key length for 128-bit keySize throws', () => {
        const settings = createSettings({
            keyType: 'custom',
            keySize: 128,
            mode: 'CBC',
            keyEncoding: 'hex',
            ivEncoding: 'hex',
            key: validKey256, // 32 bytes, but 128-bit key needs 16
            iv: validIv,
        });
        assert.throws(() => encryptAes(input, settings), /Key must be 128 bits/);
    });
});

// ─── ECB mode determinism ─────────────────────────────────────────────────────

suite('AES Engine – ECB determinism', () => {
    test('same key + plaintext always produces same ciphertext', () => {
        if (!isCipherSupported(256, 'ECB')) {
            return;
        }
        const key = crypto.randomBytes(32).toString('hex');
        const settings = createSettings({
            keyType: 'custom',
            keySize: 256,
            mode: 'ECB',
            padding: 'Pkcs7',
            keyEncoding: 'hex',
            ivEncoding: 'hex',
            key,
            iv: '',
        });
        const input = Buffer.from('deterministic input!!!!!', 'utf8');
        const enc1 = encryptAes(input, settings);
        const enc2 = encryptAes(input, settings);
        assert.strictEqual(enc1.toString('hex'), enc2.toString('hex'));
    });
});

// ─── PBKDF2 combined all modes round-trip ─────────────────────────────────────

suite('AES Engine – PBKDF2 all modes round-trip', () => {
    const allModes = ['CBC', 'ECB', 'CFB', 'CTR', 'OFB'] as const;
    const input = Buffer.from('PBKDF2 all modes test payload.', 'utf8');

    for (const mode of allModes) {
        if (!isCipherSupported(256, mode)) {
            continue;
        }

        test(`PBKDF2 round-trip: mode=${mode}`, () => {
            const settings = createSettings({
                keyType: 'PBKDF2',
                mode,
                saltType: 'custom',
                salt: '0102030405060708',
                saltEncoding: 'hex',
                customIteration: true,
                iteration: 2,
            });
            const encrypted = encryptAes(input, settings);
            const decrypted = decryptAes(encrypted, settings);
            assert.deepStrictEqual(decrypted, input);
        });
    }
});

// ─── Decrypt invalid ciphertext ───────────────────────────────────────────────

suite('AES Engine – decryption error handling', () => {
    test('decrypting garbage throws', () => {
        const settings = customKeySettings(256, 'CBC');
        settings.padding = 'Pkcs7';
        // 16 bytes of random data with wrong key – Pkcs7 unpad should throw
        const garbage = Buffer.alloc(16, 0x00);
        assert.throws(() => decryptAes(garbage, settings));
    });

    test('decrypting ciphertext with wrong passphrase produces wrong plaintext or throws', () => {
        const input = Buffer.from('sensitive data', 'utf8');
        const encSettings = createSettings({
            keyType: 'PBKDF2',
            saltType: 'custom',
            salt: 'aabbccddeeff0011',
            saltEncoding: 'hex',
            customIteration: true,
            iteration: 1,
            passphrase: 'correct passphrase',
        });
        const encrypted = encryptAes(input, encSettings);

        const decSettings = createSettings({
            keyType: 'PBKDF2',
            saltType: 'custom',
            salt: 'aabbccddeeff0011',
            saltEncoding: 'hex',
            customIteration: true,
            iteration: 1,
            passphrase: 'wrong passphrase',
        });

        let result: Buffer;
        try {
            result = decryptAes(encrypted, decSettings);
        } catch {
            return; // throwing is acceptable
        }
        // If it doesn't throw, the output must differ from the original
        assert.notDeepStrictEqual(result!, input);
    });
});

// ─── Large payload ────────────────────────────────────────────────────────────

suite('AES Engine – large payload', () => {
    test('encrypts and decrypts 1 MB payload', () => {
        const large = crypto.randomBytes(1024 * 1024);
        const settings = customKeySettings(256, 'CBC');
        const encrypted = encryptAes(large, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, large);
    });

    test('encrypts and decrypts empty buffer', () => {
        const empty = Buffer.alloc(0);
        const settings = customKeySettings(256, 'CTR');
        const encrypted = encryptAes(empty, settings);
        const decrypted = decryptAes(encrypted, settings);
        assert.deepStrictEqual(decrypted, empty);
    });
});
