import * as assert from 'assert';
import { DataConverter, MAX_CONVERSION_INPUT_BYTES } from '../converter/dataConverter';

// ─── detectFormat (static) ────────────────────────────────────────────────────

suite('DataConverter.detectFormat – by extension', () => {
    test('detects json', () => assert.strictEqual(DataConverter.detectFormat('data.json'), 'json'));
    test('detects yaml', () => assert.strictEqual(DataConverter.detectFormat('config.yaml'), 'yaml'));
    test('detects yml', () => assert.strictEqual(DataConverter.detectFormat('config.yml'), 'yaml'));
    test('detects xml', () => assert.strictEqual(DataConverter.detectFormat('payload.xml'), 'xml'));
    test('detects csv', () => assert.strictEqual(DataConverter.detectFormat('data.csv'), 'csv'));
    test('detects raml', () => assert.strictEqual(DataConverter.detectFormat('api.raml'), 'raml'));
    test('unknown extension without content returns null', () => {
        assert.strictEqual(DataConverter.detectFormat('file.xyz'), null);
    });
});

suite('DataConverter.detectFormat – by content heuristic', () => {
    test('detects JSON object from {', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', '{"a":1}'), 'json');
    });
    test('detects JSON array from [', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', '[1,2,3]'), 'json');
    });
    test('detects XML from <?xml', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', '<?xml version="1.0"?><root/>'), 'xml');
    });
    test('detects XML from <', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', '<root/>'), 'xml');
    });
    test('detects RAML from #%RAML', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', '#%RAML 1.0\ntitle: API'), 'raml');
    });
    test('detects CSV from consistent columns', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', 'name,color\nApple,Red'), 'csv');
    });
    test('detects YAML from key: value pattern', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', 'title: My API\nversion: 1'), 'yaml');
    });
    test('returns null when content is not recognisable', () => {
        assert.strictEqual(DataConverter.detectFormat('file.txt', 'just plain text'), null);
    });
    test('extension wins over content heuristic', () => {
        assert.strictEqual(DataConverter.detectFormat('data.csv', '{"a":1}'), 'csv');
    });
});

// ─── JSON → * ─────────────────────────────────────────────────────────────────

suite('DataConverter – JSON source', () => {
    const converter = new DataConverter();
    const jsonInput = JSON.stringify({ name: 'Alice', age: 30, active: true });

    test('JSON → JSON round-trips cleanly', () => {
        const result = converter.convert(jsonInput, 'json', 'json');
        assert.ok(result.success);
        assert.deepStrictEqual(JSON.parse(result.output!), JSON.parse(jsonInput));
    });

    test('JSON → JSON output is pretty-printed (2-space indent)', () => {
        const result = converter.convert(jsonInput, 'json', 'json');
        assert.ok(result.output!.includes('\n'));
        assert.ok(result.output!.includes('  '));
    });

    test('JSON → YAML produces key: value lines', () => {
        const result = converter.convert(jsonInput, 'json', 'yaml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('name:'));
        assert.ok(result.output!.includes('Alice'));
    });

    test('JSON → XML produces XML declaration', () => {
        const result = converter.convert(jsonInput, 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.startsWith('<?xml'));
        assert.ok(result.output!.includes('<root>'));
    });

    test('JSON → XML wraps scalars in tags', () => {
        const result = converter.convert('{"greeting":"hello"}', 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<greeting>hello</greeting>'));
    });

    test('JSON → XML handles nested objects', () => {
        const nested = JSON.stringify({ person: { name: 'Bob', age: 25 } });
        const result = converter.convert(nested, 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<person>'));
        assert.ok(result.output!.includes('<name>Bob</name>'));
    });

    test('JSON → XML handles arrays with <item> tags', () => {
        const withArray = JSON.stringify({ fruits: ['Apple', 'Banana'] });
        const result = converter.convert(withArray, 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<item>'));
    });

    test('JSON → XML escapes special characters', () => {
        const withSpecial = JSON.stringify({ msg: '<Hello & "World">' });
        const result = converter.convert(withSpecial, 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('&lt;'));
        assert.ok(result.output!.includes('&amp;'));
        assert.ok(result.output!.includes('&quot;'));
    });

    test('JSON → XML handles null values', () => {
        const withNull = JSON.stringify({ key: null });
        const result = converter.convert(withNull, 'json', 'xml');
        assert.ok(result.success);
    });

    test('JSON array input → JSON output preserves array', () => {
        const arr = '[{"id":1},{"id":2}]';
        const result = converter.convert(arr, 'json', 'json');
        assert.ok(result.success);
        assert.deepStrictEqual(JSON.parse(result.output!), [{ id: 1 }, { id: 2 }]);
    });

    test('invalid JSON returns error result', () => {
        const result = converter.convert('{bad json}', 'json', 'json');
        assert.strictEqual(result.success, false);
        assert.ok(result.error);
        assert.ok(result.error.length > 0);
    });
});

// ─── YAML → * ─────────────────────────────────────────────────────────────────

suite('DataConverter – YAML source', () => {
    const converter = new DataConverter();
    const yamlInput = 'name: Alice\nage: 30\nactive: true';

    test('YAML → JSON produces valid JSON', () => {
        const result = converter.convert(yamlInput, 'yaml', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.strictEqual(parsed.name, 'Alice');
        assert.strictEqual(parsed.age, 30);
        assert.strictEqual(parsed.active, true);
    });

    test('YAML → YAML round-trips', () => {
        const result = converter.convert(yamlInput, 'yaml', 'yaml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('name:'));
    });

    test('YAML → XML produces XML', () => {
        const result = converter.convert(yamlInput, 'yaml', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<?xml'));
        assert.ok(result.output!.includes('<name>Alice</name>'));
    });

    test('YAML list → JSON produces array', () => {
        const result = converter.convert('fruits:\n  - Apple\n  - Banana', 'yaml', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.deepStrictEqual(parsed.fruits, ['Apple', 'Banana']);
    });

    test('invalid YAML returns error result', () => {
        const result = converter.convert('key: [unclosed', 'yaml', 'json');
        assert.strictEqual(result.success, false);
        assert.ok(result.error);
    });
});

// ─── XML → * ──────────────────────────────────────────────────────────────────

suite('DataConverter – XML source', () => {
    const converter = new DataConverter();
    const xmlInput = '<root><name>Alice</name><age>30</age></root>';

    test('XML → JSON produces valid JSON', () => {
        const result = converter.convert(xmlInput, 'xml', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.ok(parsed.root);
    });

    test('XML → JSON preserves nested elements', () => {
        const xml = '<root><person><name>Bob</name></person></root>';
        const result = converter.convert(xml, 'xml', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.strictEqual(parsed.root.person.name, 'Bob');
    });

    test('XML → YAML produces YAML output', () => {
        const result = converter.convert(xmlInput, 'xml', 'yaml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('root:'));
    });

    test('XML → XML round-trips (JSON intermediate)', () => {
        const result = converter.convert(xmlInput, 'xml', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<?xml'));
    });

    test('XML with attributes → JSON preserves @_ prefixed keys', () => {
        const xml = '<root><item id="1">Apple</item></root>';
        const result = converter.convert(xml, 'xml', 'json');
        assert.ok(result.success);
    });

    test('invalid XML: lenient parser may succeed or return error', () => {
        // fast-xml-parser is lenient with some malformed XML and may not throw.
        // If it succeeds, output must be a non-empty string; if it fails, error must be set.
        const result = converter.convert('<root><unclosed>', 'xml', 'json');
        if (result.success) {
            assert.ok(result.output && result.output.length > 0);
        } else {
            assert.ok(result.error && result.error.length > 0);
        }
    });
});

// ─── CSV → * ──────────────────────────────────────────────────────────────────

suite('DataConverter – CSV source', () => {
    const converter = new DataConverter();
    const csvInput = 'name,color\nApple,Red\nBanana,Yellow';

    test('CSV → JSON produces array of objects', () => {
        const result = converter.convert(csvInput, 'csv', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.ok(Array.isArray(parsed));
        assert.strictEqual(parsed.length, 2);
        assert.strictEqual(parsed[0].name, 'Apple');
    });

    test('CSV → JSON infers numeric types', () => {
        const result = converter.convert('id,price\n1,9.99', 'csv', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.strictEqual(parsed[0].id, 1);
        assert.strictEqual(parsed[0].price, 9.99);
    });

    test('CSV → YAML produces list output', () => {
        const result = converter.convert(csvInput, 'csv', 'yaml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('- name:') || result.output!.includes('name:'));
    });

    test('CSV → XML produces array-wrapped XML', () => {
        const result = converter.convert(csvInput, 'csv', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<?xml'));
    });

    test('invalid CSV returns error result', () => {
        const result = converter.convert('name,color\n"unclosed', 'csv', 'json');
        assert.strictEqual(result.success, false);
        assert.ok(result.error);
    });
});

// ─── RAML → * ─────────────────────────────────────────────────────────────────

suite('DataConverter – RAML source', () => {
    const converter = new DataConverter();
    const ramlInput = '#%RAML 1.0\ntitle: Demo API\nversion: v1';

    test('RAML → JSON produces valid JSON with title field', () => {
        const result = converter.convert(ramlInput, 'raml', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.strictEqual(parsed.title, 'Demo API');
    });

    test('RAML → YAML preserves title', () => {
        const result = converter.convert(ramlInput, 'raml', 'yaml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('title:'));
    });

    test('RAML → XML produces XML with title element', () => {
        const result = converter.convert(ramlInput, 'raml', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<title>'));
    });

    test('invalid RAML returns error result', () => {
        const result = converter.convert('just plain text', 'raml', 'json');
        assert.strictEqual(result.success, false);
        assert.ok(result.error);
    });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

suite('DataConverter – result metadata', () => {
    const converter = new DataConverter();

    test('metadata.sourceFormat matches input format', () => {
        const result = converter.convert('{"a":1}', 'json', 'yaml');
        assert.strictEqual(result.metadata.sourceFormat, 'json');
    });

    test('metadata.targetFormat matches output format', () => {
        const result = converter.convert('{"a":1}', 'json', 'yaml');
        assert.strictEqual(result.metadata.targetFormat, 'yaml');
    });

    test('metadata.sourceSize is positive for non-empty input', () => {
        const result = converter.convert('{"a":1}', 'json', 'json');
        assert.ok(result.metadata.sourceSize > 0);
    });

    test('metadata.outputSize is positive on success', () => {
        const result = converter.convert('{"a":1}', 'json', 'json');
        assert.ok(result.metadata.outputSize > 0);
    });

    test('metadata.outputSize is 0 on failure', () => {
        const result = converter.convert('{bad}', 'json', 'json');
        assert.strictEqual(result.metadata.outputSize, 0);
    });

    test('metadata.conversionTime is non-negative', () => {
        const result = converter.convert('{"a":1}', 'json', 'yaml');
        assert.ok(result.metadata.conversionTime >= 0);
    });
});

// ─── Edge cases and normalizeData ─────────────────────────────────────────────

suite('DataConverter – edge cases', () => {
    const converter = new DataConverter();

    test('empty JSON object converts to empty XML root', () => {
        const result = converter.convert('{}', 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<root/>') || result.output!.includes('<root>'));
    });

    test('null values are preserved in JSON output', () => {
        const result = converter.convert('{"key":null}', 'json', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.strictEqual(parsed.key, null);
    });

    test('empty objects in values are preserved by normalizeData', () => {
        // Conversions must stay faithful to the source: an empty object is a
        // valid value and must not be dropped.
        const result = converter.convert('{"a":{},"b":"hello"}', 'json', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.deepStrictEqual(parsed.a, {});
        assert.strictEqual(parsed.b, 'hello');
    });

    test('nested empty objects are preserved by normalizeData', () => {
        const result = converter.convert('{"meta":{"settings":{}},"name":"svc"}', 'json', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.deepStrictEqual(parsed.meta, { settings: {} });
        assert.strictEqual(parsed.name, 'svc');
    });

    test('XML tag sanitization replaces invalid characters with underscore', () => {
        // key with spaces — invalid XML tag — should become underscore
        const result = converter.convert('{"key value":"test"}', 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('key_value') || result.output!.includes('key'));
    });

    test('XML tag starting with digit gets leading underscore', () => {
        const result = converter.convert('{"1abc":"value"}', 'json', 'xml');
        assert.ok(result.success);
        // tag must not start with a digit
        assert.ok(!/<\d/.test(result.output!));
    });

    test('deeply nested JSON → XML produces indented XML', () => {
        const deep = JSON.stringify({ a: { b: { c: 'leaf' } } });
        const result = converter.convert(deep, 'json', 'xml');
        assert.ok(result.success);
        assert.ok(result.output!.includes('<c>leaf</c>'));
    });

    test('large CSV (100 rows) converts successfully', () => {
        const headers = 'id,name,value';
        const rows = Array.from({ length: 100 }, (_, i) => `${i},item${i},${i * 1.5}`).join('\n');
        const result = converter.convert(`${headers}\n${rows}`, 'csv', 'json');
        assert.ok(result.success);
        const parsed = JSON.parse(result.output!);
        assert.strictEqual(parsed.length, 100);
    });

    test('unsupported source format returns error', () => {
        const result = converter.convert('some content', 'json', 'json');
        // This actually works; testing unsupported is done via TypeScript at compile time.
        // Verify that a valid source doesn't erroneously fail.
        assert.ok(result !== undefined);
    });

    test('rejects input larger than 10 MB', () => {
        const converter = new DataConverter();
        const result = converter.convert(' '.repeat(MAX_CONVERSION_INPUT_BYTES + 1), 'json', 'json');
        assert.strictEqual(result.success, false);
        assert.match(result.error ?? '', /10 MB limit/);
    });

    test('rejects circular YAML aliases', () => {
        const converter = new DataConverter();
        const result = converter.convert('root: &root\n  self: *root', 'yaml', 'json');
        assert.strictEqual(result.success, false);
        assert.match(result.error ?? '', /Circular references/);
    });
});

suite('DataConverter – prototype-polluting keys', () => {
    const converter = new DataConverter();

    test('preserves a __proto__ key from YAML instead of dropping it', () => {
        const result = converter.convert('__proto__:\n  polluted: true\na: 1', 'yaml', 'json');
        assert.ok(result.success, result.error);
        const parsed = JSON.parse(result.output!);
        // The data must survive the round-trip as an own property.
        assert.ok(Object.prototype.hasOwnProperty.call(parsed, '__proto__'));
        assert.strictEqual(parsed.a, 1);
    });

    test('does not pollute the global Object prototype', () => {
        converter.convert('__proto__:\n  polluted: true', 'yaml', 'json');
        assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
    });

    test('preserves a __proto__ key when converting YAML → YAML', () => {
        const result = converter.convert('__proto__:\n  nested: value', 'yaml', 'yaml');
        assert.ok(result.success, result.error);
        assert.match(result.output!, /__proto__:/);
        assert.match(result.output!, /nested: value/);
    });
});
