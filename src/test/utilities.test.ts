import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { hashScrypt, hashText, hmacText, signJwt, totpAt, verifyScrypt } from '../utilities/cryptoTools';
import { explainCron, chmodReport, contrastReport, convertBase, convertCase, convertColor, satisfiesSemver, slugify, subnetReport, toRoman } from '../utilities/convertTools';
import { decodeBase32, encodeBase32, encodeHex, encodePunycode, encodeUrl, gzipCompress, gzipDecompress } from '../utilities/encodeTools';
import { executeUtility, getUtilityTool } from '../utilities/execute';
import { decodeSnowflake, generateSnowflake, ulid } from '../utilities/idTools';
import { UTILITY_TOOLS } from '../utilities/registry';
import { makeQr } from '../utilities/referenceTools';
import { evaluateJsonPath, jsonToTypeScript, renderMarkdown, testGlob, testRegex } from '../utilities/textTools';

suite('Utility catalog', () => {
    test('tools have unique ids, labels, and commands', () => {
        const ids = new Set(UTILITY_TOOLS.map((tool) => tool.id));
        const labels = new Set(UTILITY_TOOLS.map((tool) => tool.label));
        const commands = new Set(UTILITY_TOOLS.map((tool) => tool.command));
        assert.strictEqual(ids.size, UTILITY_TOOLS.length);
        assert.strictEqual(labels.size, UTILITY_TOOLS.length);
        assert.strictEqual(commands.size, UTILITY_TOOLS.length);
        assert.ok(UTILITY_TOOLS.length >= 60);
    });

    test('every tool icon exists and every command is contributed', () => {
        const root = path.join(__dirname, '..', '..');
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
            contributes: { commands: Array<{ command: string }> };
        };
        const contributed = new Set(pkg.contributes.commands.map((command) => command.command));
        for (const tool of UTILITY_TOOLS) {
            assert.ok(fs.existsSync(path.join(root, 'resources', 'icons', tool.icon)), tool.icon);
            assert.ok(contributed.has(tool.command), tool.command);
        }
    });
});

suite('Encode utilities', () => {
    test('percent-encodes and decodes', () => {
        assert.strictEqual(encodeUrl('a b', 'component'), 'a%20b');
        assert.strictEqual(encodeUrl('a b', 'form'), 'a+b');
    });

    test('encodes hex and base32', () => {
        assert.strictEqual(encodeHex('hi', 'hex'), '6869');
        assert.strictEqual(encodeBase32(Buffer.from('foo')), 'MZXW6===');
        assert.strictEqual(decodeBase32('MZXW6===').toString('utf8'), 'foo');
    });

    test('converts a unicode domain to punycode', () => {
        assert.strictEqual(encodePunycode('münchen.de'), 'xn--mnchen-3ya.de');
    });

    test('round-trips gzip', () => {
        const compressed = gzipCompress('hello');
        assert.strictEqual(gzipDecompress(compressed.base64).text, 'hello');
    });
});

suite('Crypto utilities', () => {
    test('hashes abc with SHA-256', () => {
        assert.ok(hashText('abc').includes('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
    });

    test('matches an HMAC-SHA256 vector', () => {
        assert.strictEqual(
            hmacText('what do ya want for nothing?', 'Jefe', 'sha256'),
            '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
        );
    });

    test('verifies a scrypt hash', () => {
        const encoded = hashScrypt('secret', 1024);
        assert.strictEqual(verifyScrypt('secret', encoded), true);
        assert.strictEqual(verifyScrypt('other', encoded), false);
    });

    test('matches the RFC 6238 SHA-1 vector', () => {
        assert.strictEqual(totpAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000, 8, 30, 'sha1'), '94287082');
    });

    test('signs the well-known HS256 sample', () => {
        const token = signJwt('{"sub":"1234567890","name":"John Doe","iat":1516239022}', 'your-256-bit-secret', 'HS256');
        assert.strictEqual(token, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    });
});

suite('Identifier utilities', () => {
    test('ULIDs are 26 Crockford characters', () => {
        assert.match(ulid(1_700_000_000_000), /^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    test('snowflake ids decode to the same timestamp', () => {
        const id = generateSnowflake(7, 1_700_000_000_000);
        assert.match(decodeSnowflake(id), /Worker: 7/);
        assert.match(decodeSnowflake(id), /2023-11-14T22:13:20.000Z/);
    });
});

suite('Convert utilities', () => {
    test('converts bases, color, contrast, case, and slugs', () => {
        assert.strictEqual(convertBase('ff', 16, 10), '255');
        assert.match(convertColor('#ff0000'), /hsl\(0, 100%, 50%\)/);
        assert.match(contrastReport('#000000', '#ffffff'), /21:1/);
        assert.match(convertCase('hello world'), /camelCase: helloWorld/);
        assert.strictEqual(slugify('Café, World!'), 'cafe-world');
    });

    test('explains cron in UTC and rejects Quartz L', () => {
        const monday = explainCron('0 12 * * 1', new Date('2026-09-20T00:00:00Z'), 1, 'utc');
        assert.strictEqual(monday.next[0], '2026-09-21T12:00:00.000Z');
        const either = explainCron('0 0 1 * 1', new Date('2026-01-01T00:00:00Z'), 1, 'utc');
        assert.strictEqual(either.next[0], '2026-01-05T00:00:00.000Z');
        assert.throws(() => explainCron('0 0 L * *', new Date(), 1, 'utc'), /Quartz/);
    });

    test('calculates chmod, subnets, and roman numerals', () => {
        assert.match(chmodReport('755'), /rwxr-xr-x/);
        assert.match(subnetReport('192.168.1.10/24'), /Network: 192\.168\.1\.0/);
        assert.match(subnetReport('192.168.1.10/24'), /Usable hosts: 254/);
        assert.strictEqual(toRoman(2026), 'MMXXVI');
    });

    test('evaluates common semver ranges', async () => {
        assert.strictEqual((await executeUtility('semver', 'satisfies', { left: '1.9.0', right: '^1.2.3' })).output, 'Satisfies');
        assert.strictEqual((await executeUtility('semver', 'satisfies', { left: '2.0.0', right: '^1.2.3' })).output, 'Does not satisfy');
        assert.strictEqual(satisfiesSemver('1.2.9', '~1.2.3'), true);
        assert.strictEqual(satisfiesSemver('1.3.0', '~1.2.3'), false);
    });
});

suite('Text and reference utilities', () => {
    test('queries JSONPath and infers TypeScript', () => {
        const json = '{"store":{"book":[{"title":"A"},{"title":"B"}]}}';
        assert.deepStrictEqual(JSON.parse(evaluateJsonPath(json, '$.store.book[0].title')), ['A']);
        assert.deepStrictEqual(JSON.parse(evaluateJsonPath(json, '$..title')), ['A', 'B']);
        assert.match(jsonToTypeScript('{"a":1,"b":"x"}', 'Root'), /a: number/);
    });

    test('tests regex and globs, and escapes markdown', () => {
        assert.match(testRegex('\\w+', '', 'a b'), /"a"/);
        assert.match(testGlob('src/**/*.ts', 'src/a/b.ts\nsrc/a/b.js'), /^src\/a\/b\.ts$/);
        const preview = renderMarkdown('<script>alert(1)</script>');
        assert.ok(!preview.html.includes('<script'));
        assert.match(preview.html, /&lt;script&gt;/);
    });

    test('looks up web references and builds a QR code', async () => {
        assert.match((await executeUtility('http-status', 'lookup', { input: '404' })).output, /Not Found/);
        assert.match((await executeUtility('mime', 'lookup', { input: 'json' })).output, /application\/json/);
        assert.match((await executeUtility('url-parser', 'parse', { input: 'https://example.com/a?x=1' })).output, /pathname: \/a/);
        const svg = await makeQr('hello');
        assert.match(svg, /<svg/);
    });

    test('rejects an unknown action', async () => {
        await assert.rejects(() => executeUtility(getUtilityTool('hash').id, 'nope', {}), /Unknown action/);
    });
});
