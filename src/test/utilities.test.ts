import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { hashScrypt, hashText, hmacText, signJwt, totpAt, verifyScrypt } from '../utilities/cryptoTools';
import {
    explainCron,
    chmodReport,
    contrastReport,
    convertBase,
    convertCase,
    convertColor,
    satisfiesSemver,
    slugify,
    subnetReport,
    toRoman,
} from '../utilities/convertTools';
import {
    decodeBase32,
    encodeBase32,
    encodeHex,
    encodePunycode,
    encodeUrl,
    gzipCompress,
    gzipDecompress,
} from '../utilities/encodeTools';
import { executeUtility, getUtilityTool } from '../utilities/execute';
import { decodeSnowflake, generateSnowflake, ulid } from '../utilities/idTools';
import { UTILITY_TOOLS } from '../utilities/registry';
import { makeQr } from '../utilities/referenceTools';
import {
    convertList,
    convertToml,
    csvToJson,
    curlToCode,
    diffJson,
    dockerRunToCompose,
    flattenJson,
    generateMockData,
    jsonToCode,
    jsonToCsv,
    jsonToolkit,
    parseCurl,
    tokenizeShell,
    unflattenJson,
} from '../utilities/dataTools';
import {
    convertUnits,
    dateAdd,
    dateDifference,
    evaluateExpression,
    evaluateScript,
    formatDuration,
    parseDuration,
    percentageReport,
    wallTimeToInstant,
} from '../utilities/mathTools';
import {
    adler32,
    analyzePassword,
    bcryptHash,
    bcryptVerify,
    checksumReport,
    crc32,
    fnv1a32,
    luhnValid,
    murmur3,
    obfuscate,
    runCipher,
    validateNumber,
} from '../utilities/securityTools';
import {
    decodeMorse,
    encodeMorse,
    escapeFor,
    hexDump,
    numeronym,
    reverseHexDump,
    showCheatsheet,
    unescapeFor,
} from '../utilities/textExtraTools';
import {
    analyzeCsp,
    buildCsp,
    buildMetaTags,
    decodeSafeLink,
    ipToInt,
    ipv4Report,
    normalizeEmail,
    rangeToCidrs,
    svgPlaceholder,
} from '../utilities/webTools';
import { evaluateJsonPath, jsonToTypeScript, renderMarkdown, testGlob, testRegex } from '../utilities/textTools';

suite('Utility catalog', () => {
    test('tools have unique ids, labels, and commands', () => {
        const ids = new Set(UTILITY_TOOLS.map((tool) => tool.id));
        const labels = new Set(UTILITY_TOOLS.map((tool) => tool.label));
        const commands = new Set(UTILITY_TOOLS.map((tool) => tool.command));
        assert.strictEqual(ids.size, UTILITY_TOOLS.length);
        assert.strictEqual(labels.size, UTILITY_TOOLS.length);
        assert.strictEqual(commands.size, UTILITY_TOOLS.length);
        assert.ok(UTILITY_TOOLS.length >= 90);
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
        const token = signJwt(
            '{"sub":"1234567890","name":"John Doe","iat":1516239022}',
            'your-256-bit-secret',
            'HS256',
        );
        assert.strictEqual(
            token,
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        );
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
        assert.strictEqual(
            (await executeUtility('semver', 'satisfies', { left: '1.9.0', right: '^1.2.3' })).output,
            'Satisfies',
        );
        assert.strictEqual(
            (await executeUtility('semver', 'satisfies', { left: '2.0.0', right: '^1.2.3' })).output,
            'Does not satisfy',
        );
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
        assert.match(
            (await executeUtility('url-parser', 'parse', { input: 'https://example.com/a?x=1' })).output,
            /pathname: \/a/,
        );
        const svg = await makeQr('hello');
        assert.match(svg, /<svg/);
    });

    test('rejects an unknown action', async () => {
        await assert.rejects(() => executeUtility(getUtilityTool('hash').id, 'nope', {}), /Unknown action/);
    });
});

suite('Data utilities', () => {
    test('diffs JSON structurally', () => {
        const changes = diffJson({ a: 1, b: [1, 2], c: { d: 'x' } }, { a: 2, b: [1], c: { d: 'x', e: true } });
        assert.deepStrictEqual(
            changes.map((change) => `${change.kind} ${change.path}`),
            ['changed $.a', 'removed $.b[1]', 'added $.c.e'],
        );
    });

    test('round-trips JSON and CSV with nested keys', () => {
        const csv = jsonToCsv('[{"id":1,"address":{"city":"London, UK"}}]', ',');
        assert.strictEqual(csv, 'id,address.city\n1,"London, UK"');
        assert.deepStrictEqual(JSON.parse(csvToJson(csv, ',')), [{ id: 1, address: { city: 'London, UK' } }]);
    });

    test('converts TOML both ways and keeps large integers exact', () => {
        const json = JSON.parse(convertToml('[package]\nname = "demo"\nbig = 9007199254740993', 'toml-json'));
        assert.deepStrictEqual(json, { package: { name: 'demo', big: '9007199254740993' } });
        assert.match(convertToml('{"a":{"b":1}}', 'json-toml'), /\[a\]\nb = 1/);
        assert.throws(() => convertToml('{"a":null}', 'json-toml'), /null/);
    });

    test('generates typed code from JSON', () => {
        const sample = '{"id":1,"user_name":"x","items":[{"sku":"a","qty":1},{"sku":"b"}]}';
        const go = jsonToCode(sample, 'go', 'Order');
        assert.match(go, /type Order struct/);
        assert.match(go, /UserName string `json:"user_name"`/);
        assert.match(go, /Qty int64 `json:"qty,omitempty"`/);
        assert.match(jsonToCode(sample, 'rust', 'Order'), /pub qty: Option<i64>/);
        assert.match(jsonToCode(sample, 'zod', 'Order'), /qty: z\.number\(\)\.int\(\)\.optional\(\)/);
        const schema = JSON.parse(jsonToCode(sample, 'jsonschema', 'Order'));
        assert.deepStrictEqual(schema.required, ['id', 'user_name', 'items']);
    });

    test('flattens, unflattens, and sorts JSON', () => {
        assert.deepStrictEqual(flattenJson({ a: { b: [1, { c: 2 }] } }), { 'a.b.0': 1, 'a.b.1.c': 2 });
        assert.deepStrictEqual(unflattenJson({ 'a.b.0': 1, 'a.b.1.c': 2 }), { a: { b: [1, { c: 2 }] } });
        assert.strictEqual(jsonToolkit('{"b":1,"a":2}', 'sort', 0), '{"a":2,"b":1}');
    });

    test('tokenizes shell commands with quotes and continuations', () => {
        assert.deepStrictEqual(tokenizeShell(`echo "a b" 'c d' e\\ f \\\n g`), ['echo', 'a b', 'c d', 'e f', 'g']);
    });

    test('converts docker run to compose', () => {
        const { yaml, ignored } = dockerRunToCompose(
            'docker run -d --name web -p 8080:80 -e TZ=UTC --restart always -it --bogus nginx:alpine',
        );
        assert.match(yaml, /services:\n {2}web:\n {4}image: nginx:alpine/);
        assert.match(yaml, /- "8080:80"/);
        assert.match(yaml, /restart: always/);
        assert.match(yaml, /tty: true/);
        assert.deepStrictEqual(ignored, ['--bogus']);
    });

    test('parses curl and generates client code', () => {
        const request = parseCurl(
            `curl 'https://x.io/a' -H 'Accept: application/json' -d '{"a":1}' -H 'Content-Type: application/json'`,
        );
        assert.strictEqual(request.method, 'POST');
        assert.strictEqual(request.url, 'https://x.io/a');
        assert.match(curlToCode(`curl https://x.io -u u:p`, 'python'), /'Authorization': 'Basic dTpw'/);
        assert.match(curlToCode(`curl -X DELETE https://x.io`, 'fetch'), /method: "DELETE"/);
    });

    test('converts lists and generates mock data', () => {
        assert.strictEqual(
            convertList('b\na\na', {
                format: 'sql',
                quote: 'none',
                sort: 'asc',
                unique: true,
                trim: true,
                skipEmpty: true,
            }),
            "IN ('a', 'b')",
        );
        const rows = JSON.parse(generateMockData('id:id, n:int(5|5), r:enum(x)', 3, 'json'));
        assert.deepStrictEqual(rows, [
            { id: 1, n: 5, r: 'x' },
            { id: 2, n: 5, r: 'x' },
            { id: 3, n: 5, r: 'x' },
        ]);
    });
});

suite('Math utilities', () => {
    test('evaluates expressions without eval', () => {
        assert.strictEqual(evaluateExpression('2 + 3 * 4 ^ 2'), 50);
        assert.strictEqual(evaluateExpression('-2^2'), -4);
        assert.strictEqual(evaluateExpression('2(3+1) + 0xff & 0b1111'), 7);
        assert.strictEqual(evaluateExpression('max(1, 5, 3) + 4!'), 29);
        assert.throws(() => evaluateExpression('process.exit()'), /Unexpected|Unknown/);
        assert.match(evaluateScript('r = 2\npi * r^2'), /pi \* r\^2 = 12\.566370614359/);
    });

    test('converts units, percentages, and durations', () => {
        assert.match(convertUnits(100, 'temperature:c'), /212 f/);
        assert.match(convertUnits(1, 'length:mi'), /1609\.344 m /);
        assert.match(percentageReport(15, 200), /15% of 200 = 30/);
        assert.strictEqual(parseDuration('1h 30m'), 5_400_000);
        assert.strictEqual(parseDuration('01:30:00'), 5_400_000);
        assert.strictEqual(parseDuration('PT1H30M'), 5_400_000);
        assert.strictEqual(formatDuration(5_400_000), '1h 30m');
    });

    test('calculates date differences and time zones', () => {
        assert.match(dateDifference('2024-01-31T00:00:00Z', '2026-03-01T12:00:00Z'), /Calendar: 2y 1mo 1d/);
        assert.match(dateAdd('2024-01-31T00:00:00Z', '1mo', false), /UTC: {3}2024-03-02T00:00:00\.000Z/);
        assert.strictEqual(
            wallTimeToInstant('2026-03-08 09:00', 'America/New_York').toISOString(),
            '2026-03-08T13:00:00.000Z',
        );
        assert.strictEqual(
            wallTimeToInstant('2026-07-01 12:00', 'Europe/Berlin').toISOString(),
            '2026-07-01T10:00:00.000Z',
        );
    });
});

suite('Security utilities', () => {
    test('hashes and verifies bcrypt', () => {
        const hash = bcryptHash('secret', 4);
        assert.match(hash, /^\$2b\$04\$/);
        assert.strictEqual(bcryptVerify('secret', hash), true);
        assert.strictEqual(bcryptVerify('nope', hash), false);
    });

    test('rates passwords', () => {
        assert.strictEqual(analyzePassword('password').score, 0);
        assert.ok(analyzePassword('correct horse battery staple 42!').score >= 3);
    });

    test('matches standard checksum vectors', () => {
        const data = Buffer.from('123456789');
        assert.strictEqual(crc32(data).toString(16), 'cbf43926');
        assert.strictEqual(adler32(data).toString(16).padStart(8, '0'), '091e01de');
        assert.strictEqual(fnv1a32(data).toString(16), 'bb86b11c');
        assert.strictEqual(murmur3(data).toString(16), 'b4fef382');
        assert.match(checksumReport('123456789', 'utf8'), /CRC-32C \(Castagnoli\): {2}e3069283/);
        assert.match(checksumReport('123456789', 'utf8'), /CRC-16\/CCITT-FALSE: {4}29b1/);
    });

    test('runs classic ciphers', () => {
        assert.strictEqual(runCipher('Hello', 'rot13', false, ''), 'Uryyb');
        assert.strictEqual(runCipher('ATTACKATDAWN', 'vigenere', false, 'LEMON'), 'LXFOPVEFRNHR');
        assert.strictEqual(runCipher('LXFOPVEFRNHR', 'vigenere', true, 'LEMON'), 'ATTACKATDAWN');
        assert.strictEqual(runCipher(runCipher('hi', 'xor', false, 'k'), 'xor', true, 'k'), 'hi');
    });

    test('masks strings and validates check digits', () => {
        assert.strictEqual(obfuscate('sk_live_1234567890', 3, 2, '*', true), 'sk_*************90');
        assert.match(validateNumber('GB82 WEST 1234 5698 7654 32', 'auto'), /Valid: yes/);
        assert.match(validateNumber('GB82 WEST 1234 5698 7654 33', 'iban'), /Valid: no/);
        assert.strictEqual(luhnValid('4111111111111111'), true);
        assert.match(validateNumber('0-306-40615-2', 'auto'), /ISBN-13: 9780306406157/);
        assert.match(validateNumber('4006381333931', 'gtin'), /Valid: yes/);
    });
});

suite('Web and text extras', () => {
    test('decodes safe links', () => {
        assert.match(
            decodeSafeLink('https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fa&data=1'),
            /Original URL: https:\/\/example\.com\/a/,
        );
        assert.match(
            decodeSafeLink('https://urldefense.proofpoint.com/v2/url?u=https-3A__example.com_path&d=x'),
            /Original URL: https:\/\/example\.com\/path/,
        );
        assert.throws(() => decodeSafeLink('https://example.com/'), /No known wrapper/);
    });

    test('normalizes emails', () => {
        assert.strictEqual(normalizeEmail('John.Doe+news@GoogleMail.com'), 'johndoe@gmail.com');
        assert.strictEqual(normalizeEmail('A+b@Example.com'), 'a+b@example.com');
    });

    test('converts IPv4 ranges and analyzes CSP', () => {
        assert.deepStrictEqual(rangeToCidrs(ipToInt('10.0.0.0'), ipToInt('10.0.0.255')), ['10.0.0.0/24']);
        assert.deepStrictEqual(rangeToCidrs(ipToInt('10.0.0.1'), ipToInt('10.0.0.4')), [
            '10.0.0.1/32',
            '10.0.0.2/31',
            '10.0.0.4/32',
        ]);
        assert.match(ipv4Report('3232235777'), /Dotted: 192\.168\.1\.1/);
        assert.match(analyzeCsp("script-src 'unsafe-inline'"), /unsafe-inline/);
        assert.match(analyzeCsp(buildCsp('strict')), /No findings/);
    });

    test('escapes meta tags and SVG text', () => {
        assert.match(
            buildMetaTags({
                title: '<x>',
                description: '',
                url: '',
                image: '',
                siteName: '',
                type: 'website',
                twitter: '',
                card: '',
                themeColor: '',
                locale: '',
            }),
            /<title>&lt;x&gt;<\/title>/,
        );
        assert.ok(!svgPlaceholder(10, 10, '#fff', '#000', '<script>', 0).includes('<script>'));
        assert.throws(() => svgPlaceholder(10, 10, 'red" onload="x', '#000', '', 0), /Invalid color/);
    });

    test('escapes strings per language and round-trips', () => {
        const raw = 'C:\\path\n"q" ü';
        for (const target of [
            'json',
            'java',
            'csharp',
            'c',
            'python',
            'javascript',
            'shell',
            'powershell',
            'sql',
            'csv',
            'xml',
            'regex',
        ]) {
            assert.strictEqual(unescapeFor(escapeFor(raw, target), target), raw, target);
        }
        assert.strictEqual(escapeFor("it's", 'shell'), `'it'\\''s'`);
        assert.strictEqual(escapeFor('a\0', 'json'), '"a\\u0000"');
    });

    test('numeronyms, Morse, hex dumps, and cheatsheets', () => {
        assert.strictEqual(numeronym('internationalization kubernetes a11y'), 'i18n k8s a11y');
        assert.strictEqual(decodeMorse(encodeMorse('SOS help')), 'SOS HELP');
        const dump = hexDump(Buffer.from('Hello'), 16);
        assert.match(dump, /^00000000: 4865 6c6c 6f/);
        assert.strictEqual(reverseHexDump(dump).toString('utf8'), 'Hello');
        assert.match(showCheatsheet('git', 'reflog'), /git reflog/);
    });

    test('generates locally administered MAC addresses', async () => {
        const output = (await executeUtility('mac', 'generate', {})).output.split('\n');
        assert.strictEqual(output.length, 10);
        for (const mac of output) {
            assert.match(mac, /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
            assert.strictEqual(parseInt(mac.slice(0, 2), 16) & 0x03, 0x02);
        }
    });

    test('select defaults are valid options', async () => {
        for (const tool of UTILITY_TOOLS) {
            for (const field of tool.fields) {
                const options = field.options ?? [];
                const selected = field.defaultValue ?? options[0]?.value;
                assert.ok(
                    field.kind !== 'select' || options.some((option) => option.value === selected),
                    `${tool.id}.${field.id}`,
                );
            }
        }
    });
});
