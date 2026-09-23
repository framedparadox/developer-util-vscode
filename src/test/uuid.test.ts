/**
 * Tests for UUID generation logic extracted from UUIDPanel.
 * Pure generation functions only – no VS Code dependency.
 */
import * as assert from 'assert';
import { decodeBase64 } from '../panels/base64Panel';
import { NULL_UUID, UUID_REGEX, UuidGenerator } from '../uuid/generate';

const generator = new UuidGenerator();
const uuidv1 = () => generator.uuidv1();
const uuidv4 = () => generator.uuidv4();
const uuidv7 = () => generator.uuidv7();
const nullUUID = () => generator.nullUuid();

// ─── Format helpers ───────────────────────────────────────────────────────────

function uuidVersion(uuid: string): number {
    return parseInt(uuid[14], 16);
}

function uuidVariant(uuid: string): string {
    const variantChar = parseInt(uuid[19], 16);
    if ((variantChar & 0b1100) === 0b1000) {
        return 'RFC4122';
    }
    if ((variantChar & 0b1100) === 0b1100) {
        return 'Microsoft';
    }
    return 'NCS';
}

// ─── Null UUID ────────────────────────────────────────────────────────────────

suite('UUIDPanel – Null UUID', () => {
    test('equals 00000000-0000-0000-0000-000000000000', () => {
        assert.strictEqual(nullUUID(), NULL_UUID);
    });

    test('matches UUID regex format', () => {
        assert.ok(UUID_REGEX.test(nullUUID()));
    });

    test('all hex chars are 0', () => {
        assert.ok(
            nullUUID()
                .replace(/-/g, '')
                .split('')
                .every((c) => c === '0'),
        );
    });

    test('is always the same value', () => {
        assert.strictEqual(nullUUID(), nullUUID());
    });
});

// ─── UUID v1 ─────────────────────────────────────────────────────────────────

suite('UUIDPanel – UUID v1', () => {
    test('has correct format (8-4-4-4-12)', () => {
        assert.ok(UUID_REGEX.test(uuidv1()));
    });

    test('version nibble is 1', () => {
        assert.strictEqual(uuidVersion(uuidv1()), 1);
    });

    test('variant bits are RFC4122 (10xx)', () => {
        assert.strictEqual(uuidVariant(uuidv1()), 'RFC4122');
    });

    test('two calls produce different UUIDs', () => {
        assert.notStrictEqual(uuidv1(), uuidv1());
    });

    test('50 generated UUIDs are all unique', () => {
        const uuids = Array.from({ length: 50 }, () => uuidv1());
        assert.strictEqual(new Set(uuids).size, 50);
    });

    test('50 generated UUIDs all have correct format', () => {
        Array.from({ length: 50 }, () => uuidv1()).forEach((u) =>
            assert.ok(UUID_REGEX.test(u), `invalid format: ${u}`),
        );
    });

    test('50 generated UUIDs all have version 1', () => {
        Array.from({ length: 50 }, () => uuidv1()).forEach((u) =>
            assert.strictEqual(uuidVersion(u), 1, `wrong version in: ${u}`),
        );
    });

    test('has 5 hyphen-separated groups', () => {
        assert.strictEqual(uuidv1().split('-').length, 5);
    });
});

// ─── UUID v4 ─────────────────────────────────────────────────────────────────

suite('UUIDPanel – UUID v4', () => {
    test('has correct format (8-4-4-4-12)', () => {
        assert.ok(UUID_REGEX.test(uuidv4()));
    });

    test('version nibble is 4', () => {
        assert.strictEqual(uuidVersion(uuidv4()), 4);
    });

    test('variant bits are RFC4122 (10xx)', () => {
        assert.strictEqual(uuidVariant(uuidv4()), 'RFC4122');
    });

    test('two calls produce different UUIDs', () => {
        assert.notStrictEqual(uuidv4(), uuidv4());
    });

    test('100 generated UUIDs are all unique', () => {
        const uuids = Array.from({ length: 100 }, () => uuidv4());
        assert.strictEqual(new Set(uuids).size, 100);
    });

    test('100 generated UUIDs all have version 4', () => {
        Array.from({ length: 100 }, () => uuidv4()).forEach((u) =>
            assert.strictEqual(uuidVersion(u), 4, `wrong version in: ${u}`),
        );
    });

    test('100 generated UUIDs all have RFC4122 variant', () => {
        Array.from({ length: 100 }, () => uuidv4()).forEach((u) =>
            assert.strictEqual(uuidVariant(u), 'RFC4122', `wrong variant in: ${u}`),
        );
    });
});

// ─── UUID v7 ─────────────────────────────────────────────────────────────────

suite('UUIDPanel – UUID v7', () => {
    test('has correct format (8-4-4-4-12)', () => {
        assert.ok(UUID_REGEX.test(uuidv7()));
    });

    test('version nibble is 7', () => {
        assert.strictEqual(uuidVersion(uuidv7()), 7);
    });

    test('variant bits are RFC4122 (10xx)', () => {
        assert.strictEqual(uuidVariant(uuidv7()), 'RFC4122');
    });

    test('two calls produce different UUIDs', () => {
        assert.notStrictEqual(uuidv7(), uuidv7());
    });

    test('50 generated UUIDs are all unique', () => {
        const uuids = Array.from({ length: 50 }, () => uuidv7());
        assert.strictEqual(new Set(uuids).size, 50);
    });

    test('50 generated UUIDs all have version 7', () => {
        Array.from({ length: 50 }, () => uuidv7()).forEach((u) =>
            assert.strictEqual(uuidVersion(u), 7, `wrong version in: ${u}`),
        );
    });

    test('50 generated UUIDs all have RFC4122 variant', () => {
        Array.from({ length: 50 }, () => uuidv7()).forEach((u) =>
            assert.strictEqual(uuidVariant(u), 'RFC4122', `wrong variant in: ${u}`),
        );
    });

    test('first 8 hex chars encode current timestamp (within 5 seconds)', () => {
        const before = Date.now();
        const uuid = uuidv7();
        const after = Date.now();

        const timeHexFromUUID = uuid.replace(/-/g, '').substring(0, 12);
        const msFromUUID = parseInt(timeHexFromUUID, 16);
        assert.ok(
            msFromUUID >= before - 10 && msFromUUID <= after + 10,
            `timestamp ${msFromUUID} not in range [${before}, ${after}]`,
        );
    });

    test('monotonically increasing within tight loop (sortable)', () => {
        const uuids = Array.from({ length: 20 }, () => uuidv7());
        for (let i = 1; i < uuids.length; i++) {
            assert.ok(uuids[i] > uuids[i - 1], `UUID ${i} ${uuids[i]} is not greater than previous ${uuids[i - 1]}`);
        }
    });

    test('sets the multicast bit on UUID v1 node IDs', () => {
        const node = uuidv1().split('-')[4];
        assert.strictEqual(parseInt(node.slice(0, 2), 16) & 0x01, 0x01);
    });
});

// ─── Base64 encode/decode (from Base64Panel logic) ────────────────────────────

suite('Base64Panel – encode/decode logic', () => {
    test('encodes plain text to base64', () => {
        const encoded = Buffer.from('Hello, World!', 'utf8').toString('base64');
        assert.strictEqual(encoded, 'SGVsbG8sIFdvcmxkIQ==');
    });

    test('decodes base64 to plain text', () => {
        const decoded = decodeBase64('SGVsbG8sIFdvcmxkIQ==').toString('utf8');
        assert.strictEqual(decoded, 'Hello, World!');
    });

    test('encodes empty string', () => {
        assert.strictEqual(Buffer.from('', 'utf8').toString('base64'), '');
    });

    test('decodes empty base64 string', () => {
        assert.strictEqual(decodeBase64('').toString('utf8'), '');
    });

    test('round-trip: encode then decode returns original', () => {
        const texts = [
            'Hello World',
            'Developer Utility Tools',
            '日本語テスト',
            'Special chars: !@#$%^&*()',
            '\n\r\t',
            'a'.repeat(1000),
        ];
        texts.forEach((text) => {
            const encoded = Buffer.from(text, 'utf8').toString('base64');
            const decoded = decodeBase64(encoded).toString('utf8');
            assert.strictEqual(decoded, text, `Failed for: ${text.substring(0, 30)}`);
        });
    });

    test('encodes binary-safe (arbitrary bytes)', () => {
        const bytes = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01]);
        const encoded = bytes.toString('base64');
        const decoded = decodeBase64(encoded);
        assert.deepStrictEqual(decoded, bytes);
    });

    test('base64 output uses only valid characters', () => {
        const encoded = Buffer.from('Test string 123!', 'utf8').toString('base64');
        assert.ok(/^[A-Za-z0-9+/]+=*$/.test(encoded));
    });

    test('encode JSON string', () => {
        const json = JSON.stringify({ key: 'value', count: 42 });
        const encoded = Buffer.from(json, 'utf8').toString('base64');
        const decoded = decodeBase64(encoded).toString('utf8');
        assert.deepStrictEqual(JSON.parse(decoded), { key: 'value', count: 42 });
    });

    test('encode URL-like string', () => {
        const url = 'https://example.com/api?token=abc&id=123';
        const encoded = Buffer.from(url, 'utf8').toString('base64');
        const decoded = decodeBase64(encoded).toString('utf8');
        assert.strictEqual(decoded, url);
    });

    test('decodes with padding variations', () => {
        // 1 padding
        assert.strictEqual(decodeBase64('YQ==').toString('utf8'), 'a');
        // 2 padding
        assert.strictEqual(decodeBase64('YWI=').toString('utf8'), 'ab');
        // no padding
        assert.strictEqual(decodeBase64('YWJj').toString('utf8'), 'abc');
    });

    test('rejects malformed Base64 instead of silently decoding it', () => {
        assert.throws(() => decodeBase64('not base64!'), /valid Base64/);
        assert.throws(() => decodeBase64('A'), /valid Base64/);
    });
});
