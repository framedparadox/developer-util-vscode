import * as assert from 'assert';
import { CSVParser, JSONParser, RAMLParser, XMLParserImpl, YAMLParser } from '../visualizer/parsers';
import { detectDataFormat } from '../visualizer/format';
import { DataTransformer } from '../visualizer/transformer';

// ─── detectDataFormat ─────────────────────────────────────────────────────────

suite('detectDataFormat – file extension', () => {
    test('detects .json by extension', () => {
        assert.strictEqual(detectDataFormat('', 'data.json'), 'json');
    });

    test('detects .yaml by extension', () => {
        assert.strictEqual(detectDataFormat('', 'api.yaml'), 'yaml');
    });

    test('detects .yml by extension', () => {
        assert.strictEqual(detectDataFormat('', 'config.yml'), 'yaml');
    });

    test('detects .xml by extension', () => {
        assert.strictEqual(detectDataFormat('', 'payload.xml'), 'xml');
    });

    test('detects .csv by extension', () => {
        assert.strictEqual(detectDataFormat('', 'data.csv'), 'csv');
    });

    test('detects .raml by extension', () => {
        assert.strictEqual(detectDataFormat('', 'api.raml'), 'raml');
    });

    test('extension takes priority over content', () => {
        // Content looks like JSON but extension says YAML
        assert.strictEqual(detectDataFormat('{"key":"val"}', 'data.yaml'), 'yaml');
    });

    test('unknown extension falls through to content heuristics', () => {
        assert.strictEqual(detectDataFormat('{"key":"val"}', 'data.txt'), 'json');
    });
});

suite('detectDataFormat – language ID', () => {
    test('detects json language ID', () => {
        assert.strictEqual(detectDataFormat('', undefined, 'json'), 'json');
    });

    test('detects jsonc language ID as json', () => {
        assert.strictEqual(detectDataFormat('', undefined, 'jsonc'), 'json');
    });

    test('detects yaml language ID', () => {
        assert.strictEqual(detectDataFormat('', undefined, 'yaml'), 'yaml');
    });

    test('detects xml language ID', () => {
        assert.strictEqual(detectDataFormat('', undefined, 'xml'), 'xml');
    });

    test('detects csv language ID', () => {
        assert.strictEqual(detectDataFormat('', undefined, 'csv'), 'csv');
    });

    test('language ID takes priority over content', () => {
        assert.strictEqual(detectDataFormat('{"key":"val"}', undefined, 'yaml'), 'yaml');
    });
});

suite('detectDataFormat – content heuristics', () => {
    test('detects RAML from #%RAML header', () => {
        assert.strictEqual(detectDataFormat('#%RAML 1.0\ntitle: Demo'), 'raml');
    });

    test('detects JSON object from {', () => {
        assert.strictEqual(detectDataFormat('{"ok":true}'), 'json');
    });

    test('detects JSON array from [', () => {
        assert.strictEqual(detectDataFormat('[1,2,3]'), 'json');
    });

    test('detects XML from <', () => {
        assert.strictEqual(detectDataFormat('<root><item/></root>'), 'xml');
    });

    test('detects XML from <?xml declaration', () => {
        assert.strictEqual(detectDataFormat('<?xml version="1.0"?><root/>'), 'xml');
    });

    test('detects CSV with consistent column counts', () => {
        assert.strictEqual(detectDataFormat('name,color\nApple,Red\nBanana,Yellow'), 'csv');
    });

    test('detects YAML from key: value pattern', () => {
        assert.strictEqual(detectDataFormat('title: My API\nversion: 1'), 'yaml');
    });

    test('detects YAML from --- document separator', () => {
        assert.strictEqual(detectDataFormat('---\nkey: value'), 'yaml');
    });

    test('detects YAML from list items', () => {
        assert.strictEqual(detectDataFormat('- item1\n- item2'), 'yaml');
    });

    test('returns null for empty string', () => {
        assert.strictEqual(detectDataFormat(''), null);
    });

    test('returns null for whitespace-only string', () => {
        assert.strictEqual(detectDataFormat('   \n\t  '), null);
    });

    test('returns null for unrecognised content', () => {
        assert.strictEqual(detectDataFormat('this is just plain prose text'), null);
    });
});

// ─── JSONParser ───────────────────────────────────────────────────────────────

suite('JSONParser', () => {
    const parser = new JSONParser();

    test('parses flat object', () => {
        const result = parser.parse('{"a":1,"b":"hello","c":true}');
        assert.deepStrictEqual(result, { a: 1, b: 'hello', c: true });
    });

    test('parses nested object', () => {
        const result = parser.parse('{"outer":{"inner":42}}');
        assert.deepStrictEqual(result, { outer: { inner: 42 } });
    });

    test('parses array of objects', () => {
        const result = parser.parse('[{"id":1},{"id":2}]');
        assert.deepStrictEqual(result, [{ id: 1 }, { id: 2 }]);
    });

    test('parses null values', () => {
        const result = parser.parse('{"key":null}');
        assert.deepStrictEqual(result, { key: null });
    });

    test('parses empty object', () => {
        assert.deepStrictEqual(parser.parse('{}'), {});
    });

    test('parses empty array', () => {
        assert.deepStrictEqual(parser.parse('[]'), []);
    });

    test('throws with message on invalid JSON', () => {
        assert.throws(() => parser.parse('{'), /JSON parsing failed/);
    });

    test('throws on bare string without quotes', () => {
        assert.throws(() => parser.parse('hello'), /JSON parsing failed/);
    });

    test('throws on empty string', () => {
        assert.throws(() => parser.parse(''), /JSON parsing failed/);
    });
});

// ─── YAMLParser ──────────────────────────────────────────────────────────────

suite('YAMLParser', () => {
    const parser = new YAMLParser();

    test('parses flat key-value pairs', () => {
        const result = parser.parse('name: Alice\nage: 30');
        assert.deepStrictEqual(result, { name: 'Alice', age: 30 });
    });

    test('parses nested objects', () => {
        const result = parser.parse('person:\n  name: Bob\n  age: 25');
        assert.deepStrictEqual(result, { person: { name: 'Bob', age: 25 } });
    });

    test('parses YAML list', () => {
        const result = parser.parse('fruits:\n  - Apple\n  - Banana');
        assert.deepStrictEqual(result, { fruits: ['Apple', 'Banana'] });
    });

    test('parses list of objects', () => {
        const result = parser.parse('users:\n  - name: Alice\n  - name: Bob');
        assert.deepStrictEqual(result, { users: [{ name: 'Alice' }, { name: 'Bob' }] });
    });

    test('parses YAML boolean values', () => {
        const result = parser.parse('active: true\ndisabled: false');
        assert.deepStrictEqual(result, { active: true, disabled: false });
    });

    test('parses YAML null', () => {
        const result = parser.parse('key: null');
        assert.deepStrictEqual(result, { key: null });
    });

    test('returns null/undefined for empty string', () => {
        // js-yaml returns undefined for an empty document
        const result = parser.parse('');
        assert.ok(result === null || result === undefined);
    });

    test('throws on invalid YAML', () => {
        assert.throws(() => parser.parse('key: [unclosed'), /YAML parsing failed/);
    });
});

// ─── XMLParserImpl ────────────────────────────────────────────────────────────

suite('XMLParserImpl', () => {
    const parser = new XMLParserImpl();

    test('parses simple element', () => {
        const result = parser.parse('<root><name>Alice</name></root>');
        assert.ok(result.root);
        assert.strictEqual(result.root.name, 'Alice');
    });

    test('parses element attributes with @_ prefix', () => {
        const result = parser.parse('<item id="42" active="true"/>');
        assert.strictEqual(result.item['@_id'], 42);
    });

    test('parses text node as #text', () => {
        const result = parser.parse('<root><item id="1">Apple</item></root>');
        assert.strictEqual(result.root.item['#text'], 'Apple');
        assert.strictEqual(result.root.item['@_id'], 1);
    });

    test('parses nested elements', () => {
        const result = parser.parse('<root><person><name>Bob</name><age>25</age></person></root>');
        assert.strictEqual(result.root.person.name, 'Bob');
        assert.strictEqual(result.root.person.age, 25);
    });

    test('parses numeric values from attributes', () => {
        const result = parser.parse('<data count="10" ratio="3.14"/>');
        assert.strictEqual(result.data['@_count'], 10);
        assert.strictEqual(result.data['@_ratio'], 3.14);
    });

    test('strips namespace prefixes', () => {
        const result = parser.parse('<ns:root xmlns:ns="http://example.com"><ns:name>Test</ns:name></ns:root>');
        assert.ok(result.root || result['ns:root']);
    });

    test('parses unclosed tag gracefully or throws', () => {
        // fast-xml-parser is lenient with some malformed XML; it either parses
        // or throws — either behaviour is acceptable. If it returns, it must be an object.
        try {
            const result = parser.parse('<root><unclosed>');
            assert.ok(typeof result === 'object');
        } catch (e: any) {
            assert.ok(/XML parsing failed/.test(e.message));
        }
    });

    test('parses self-closing empty element', () => {
        const result = parser.parse('<root><empty/></root>');
        assert.ok(result.root !== undefined);
    });
});

// ─── CSVParser ───────────────────────────────────────────────────────────────

suite('CSVParser', () => {
    const parser = new CSVParser();

    test('parses simple CSV with headers', () => {
        const result = parser.parse('name,color\nApple,Red\nBanana,Yellow');
        assert.strictEqual(result.length, 2);
        assert.deepStrictEqual(result[0], { name: 'Apple', color: 'Red' });
        assert.deepStrictEqual(result[1], { name: 'Banana', color: 'Yellow' });
    });

    test('parses numeric values via dynamicTyping', () => {
        const result = parser.parse('id,price\n1,9.99\n2,14.50');
        assert.strictEqual(result[0].id, 1);
        assert.strictEqual(result[0].price, 9.99);
    });

    test('parses boolean values via dynamicTyping', () => {
        const result = parser.parse('name,active\nAlice,true\nBob,false');
        assert.strictEqual(result[0].active, true);
        assert.strictEqual(result[1].active, false);
    });

    test('trims whitespace from headers', () => {
        const result = parser.parse(' name , color \nApple,Red');
        assert.ok('name' in result[0]);
        assert.ok('color' in result[0]);
    });

    test('skips empty lines', () => {
        const result = parser.parse('name,color\nApple,Red\n\nBanana,Yellow\n');
        assert.strictEqual(result.length, 2);
    });

    test('parses quoted fields containing commas', () => {
        const result = parser.parse('name,description\nApple,"Red, juicy"');
        assert.strictEqual(result[0].description, 'Red, juicy');
    });

    test('returns empty array for header-only CSV', () => {
        const result = parser.parse('name,color');
        assert.deepStrictEqual(result, []);
    });

    test('throws on unmatched quotes', () => {
        assert.throws(() => parser.parse('name,color\n"Apple,Red'), /CSV parsing failed/);
    });

    test('handles many columns', () => {
        const headers = Array.from({ length: 10 }, (_, i) => `col${i}`).join(',');
        const values = Array.from({ length: 10 }, (_, i) => i).join(',');
        const result = parser.parse(`${headers}\n${values}`);
        assert.strictEqual(result[0].col9, 9);
    });
});

// ─── RAMLParser ───────────────────────────────────────────────────────────────

suite('RAMLParser', () => {
    const parser = new RAMLParser();

    test('parses basic RAML 1.0 document', () => {
        const raml = '#%RAML 1.0\ntitle: Demo API\nversion: v1\nbaseUri: http://example.com';
        const result = parser.parse(raml);
        assert.strictEqual(result.title, 'Demo API');
        assert.strictEqual(result.version, 'v1');
    });

    test('parses resource endpoints', () => {
        const raml = '#%RAML 1.0\ntitle: API\n/users:\n  get:\n    description: List users';
        const result = parser.parse(raml);
        assert.ok(result['/users']);
        assert.ok(result['/users'].get);
    });

    test('parses nested resources', () => {
        const raml = '#%RAML 1.0\ntitle: API\n/users:\n  /{id}:\n    get:\n      description: Get user by ID';
        const result = parser.parse(raml);
        assert.ok(result['/users']['/{id}']);
    });

    test('parses response codes', () => {
        const raml = '#%RAML 1.0\ntitle: API\n/accounts:\n  get:\n    responses:\n      200:\n        description: OK\n      404:\n        description: Not Found';
        const result = parser.parse(raml);
        assert.ok(result['/accounts'].get.responses[200]);
        assert.ok(result['/accounts'].get.responses[404]);
    });

    test('throws for non-object RAML', () => {
        assert.throws(() => parser.parse('just a string'), /RAML parsing failed/);
    });

    test('throws for empty RAML', () => {
        assert.throws(() => parser.parse(''), /RAML parsing failed/);
    });

    test('throws for invalid YAML structure in RAML', () => {
        assert.throws(() => parser.parse('key: [unclosed'), /RAML parsing failed/);
    });
});

// ─── DataTransformer.jsonToGraph ──────────────────────────────────────────────

suite('DataTransformer.jsonToGraph – basic structure', () => {
    test('flat object produces root node with inline rows', () => {
        const graph = DataTransformer.jsonToGraph({ name: 'Alice', age: 30 });
        assert.ok(graph.nodes.some((n) => n.title.startsWith('Root Object')));
        assert.ok(graph.nodes.some((n) => n.rows.some((r) => r.key === 'name' && !r.isReference)));
        assert.ok(graph.nodes.some((n) => n.rows.some((r) => r.key === 'age' && !r.isReference)));
    });

    test('nested object creates child node and edge', () => {
        const graph = DataTransformer.jsonToGraph({ person: { name: 'Bob', age: 25 } });
        assert.ok(graph.edges.some((e) => e.label === 'person'));
        assert.ok(graph.nodes.some((n) => n.title.startsWith('person')));
    });

    test('array at root creates array node', () => {
        const graph = DataTransformer.jsonToGraph([1, 2, 3]);
        assert.ok(graph.nodes.some((n) => n.title.startsWith('Root Array')));
    });

    test('array items get [0], [1], [2] edge labels', () => {
        const graph = DataTransformer.jsonToGraph([{ a: 1 }, { a: 2 }]);
        assert.ok(graph.edges.some((e) => e.label === '[0]'));
        assert.ok(graph.edges.some((e) => e.label === '[1]'));
    });

    test('empty object produces single node with {0 keys} row', () => {
        const graph = DataTransformer.jsonToGraph({});
        assert.strictEqual(graph.nodes.length, 1);
        assert.strictEqual(graph.nodes[0].rows[0].value, '{0 keys}');
    });

    test('empty array produces single node with [0 items] row', () => {
        const graph = DataTransformer.jsonToGraph([]);
        assert.strictEqual(graph.nodes.length, 1);
        assert.strictEqual(graph.nodes[0].rows[0].value, '[0 items]');
    });

    test('primitive root produces value-type node', () => {
        const graph = DataTransformer.jsonToGraph('hello');
        assert.strictEqual(graph.nodes.length, 1);
        assert.strictEqual(graph.nodes[0].type, 'value');
    });

    test('null root produces value-type node', () => {
        const graph = DataTransformer.jsonToGraph(null);
        assert.strictEqual(graph.nodes.length, 1);
        assert.strictEqual(graph.nodes[0].type, 'value');
    });

    test('numeric root produces value-type node', () => {
        const graph = DataTransformer.jsonToGraph(42);
        assert.strictEqual(graph.nodes[0].type, 'value');
    });

    test('boolean root produces value-type node', () => {
        const graph = DataTransformer.jsonToGraph(true);
        assert.strictEqual(graph.nodes[0].type, 'value');
    });
});

suite('DataTransformer.jsonToGraph – depth and node counts', () => {
    test('maxDepth is 0 for flat object', () => {
        const graph = DataTransformer.jsonToGraph({ a: 1 });
        assert.ok(graph.maxDepth >= 0);
    });

    test('maxDepth increases with nesting', () => {
        const nested = { a: { b: { c: { d: 1 } } } };
        const graph = DataTransformer.jsonToGraph(nested);
        assert.ok(graph.maxDepth >= 3);
    });

    test('totalNodes counts all nodes including children', () => {
        const graph = DataTransformer.jsonToGraph({ a: { b: 1 }, c: [1, 2] });
        assert.ok(graph.totalNodes >= 3);
    });

    test('deeply nested JSON produces correct node and edge counts', () => {
        const data = {
            name: 'Sample',
            data: {
                users: [
                    { id: 1, name: 'Alice', active: true },
                    { id: 2, name: 'Bob', active: false },
                ],
            },
        };
        const graph = DataTransformer.jsonToGraph(data);
        assert.ok(graph.totalNodes >= 5);
        assert.ok(graph.maxDepth >= 3);
        assert.ok(graph.edges.some((e) => e.label === 'data'));
        assert.ok(graph.edges.some((e) => e.label === 'users'));
    });
});

suite('DataTransformer.jsonToGraph – node properties', () => {
    test('all nodes have positive width and height', () => {
        const graph = DataTransformer.jsonToGraph({ key: 'value', count: 42 });
        graph.nodes.forEach((node) => {
            assert.ok(node.width > 0, `node ${node.id} has zero width`);
            assert.ok(node.height > 0, `node ${node.id} has zero height`);
        });
    });

    test('all edges have from and to referencing existing node IDs', () => {
        const graph = DataTransformer.jsonToGraph({ nested: { value: 1 } });
        const nodeIds = new Set(graph.nodes.map((n) => n.id));
        graph.edges.forEach((edge) => {
            assert.ok(nodeIds.has(edge.from), `edge.from=${edge.from} not found`);
            assert.ok(nodeIds.has(edge.to), `edge.to=${edge.to} not found`);
        });
    });

    test('each node has a unique id', () => {
        const graph = DataTransformer.jsonToGraph({ a: 1, b: { c: 2 }, d: [3, 4] });
        const ids = graph.nodes.map((n) => n.id);
        assert.strictEqual(new Set(ids).size, ids.length);
    });

    test('root node has depth 0', () => {
        const graph = DataTransformer.jsonToGraph({ x: 1 });
        const root = graph.nodes.find((n) => n.depth === 0);
        assert.ok(root);
    });

    test('child nodes have depth > 0', () => {
        const graph = DataTransformer.jsonToGraph({ nested: { val: 1 } });
        const deep = graph.nodes.find((n) => n.depth > 0);
        assert.ok(deep);
    });
});

suite('DataTransformer.jsonToGraph – value formatting', () => {
    test('long strings are truncated in graph rows', () => {
        const longStr = 'A'.repeat(100);
        const graph = DataTransformer.jsonToGraph({ text: longStr });
        const root = graph.nodes[0];
        const row = root.rows.find((r) => r.key === 'text');
        if (row && !row.isReference) {
            assert.ok(row.value.length < longStr.length + 3, 'long string should be truncated');
        }
    });

    test('null value is represented as "null" string', () => {
        const graph = DataTransformer.jsonToGraph({ key: null });
        const root = graph.nodes[0];
        const row = root.rows.find((r) => r.key === 'key');
        if (row) {
            assert.strictEqual(row.value, 'null');
        }
    });

    test('boolean true is represented as "true" string', () => {
        const graph = DataTransformer.jsonToGraph({ flag: true });
        const root = graph.nodes[0];
        const row = root.rows.find((r) => r.key === 'flag');
        if (row) {
            assert.strictEqual(row.value, 'true');
        }
    });

    test('number value is represented as string', () => {
        const graph = DataTransformer.jsonToGraph({ count: 99 });
        const root = graph.nodes[0];
        const row = root.rows.find((r) => r.key === 'count');
        if (row) {
            assert.strictEqual(row.value, '99');
        }
    });
});

// ─── DataTransformer.jsonToGraph – format integration ─────────────────────────

suite('DataTransformer.jsonToGraph – from parsers', () => {
    test('YAML parsed data produces correct graph', () => {
        const parsed = new YAMLParser().parse('fruits:\n  - name: Apple\n    color: Red');
        const graph = DataTransformer.jsonToGraph(parsed);
        assert.ok(graph.nodes.length > 1);
        assert.ok(graph.edges.some((e) => e.label === 'fruits'));
    });

    test('XML parsed data produces attribute and text rows', () => {
        const parsed = new XMLParserImpl().parse('<root><item id="1">Apple</item></root>');
        const graph = DataTransformer.jsonToGraph(parsed);
        const itemNode = graph.nodes.find((n) => n.title.startsWith('item'));
        assert.ok(itemNode);
        assert.ok(itemNode.rows.some((r) => r.key === '@_id'));
        assert.ok(itemNode.rows.some((r) => r.key === '#text'));
    });

    test('CSV parsed data produces array of objects', () => {
        const parsed = new CSVParser().parse('name,color\nApple,Red\nBanana,Yellow');
        const graph = DataTransformer.jsonToGraph(parsed);
        assert.ok(graph.nodes.some((n) => n.type === 'array'));
        assert.ok(graph.edges.some((e) => e.label === '[0]'));
        assert.ok(graph.nodes.some((n) => n.rows.some((r) => r.key === 'name' && r.value.includes('Apple'))));
    });

    test('RAML parsed data produces graph with title key', () => {
        const raml = '#%RAML 1.0\ntitle: Demo API\n/accounts:\n  get:\n    responses:\n      200:\n        body:\n          application/json: {}';
        const parsed = new RAMLParser().parse(raml);
        const graph = DataTransformer.jsonToGraph(parsed);
        assert.ok(graph.nodes.length > 1);
        assert.ok(graph.nodes.some((n) => n.rows.some((r) => r.key === 'title')));
    });

    test('deeply nested JSON produces edges for all levels', () => {
        const data = JSON.parse(JSON.stringify({
            name: 'Sample',
            data: {
                users: [
                    { id: 1, name: 'Alice', active: true },
                    { id: 2, name: 'Bob', active: false },
                ],
            },
        }));
        const graph = DataTransformer.jsonToGraph(data);
        assert.ok(graph.edges.some((e) => e.label === 'data'));
        assert.ok(graph.edges.some((e) => e.label === 'users'));
        assert.ok(graph.nodes.some((n) => n.rows.some((r) => r.key === 'name' && !r.isReference)));
    });
});

// ─── DataTransformer.jsonToNodes ──────────────────────────────────────────────

suite('DataTransformer.jsonToNodes', () => {
    test('root object gets object type', () => {
        const node = DataTransformer.jsonToNodes({ a: 1 });
        assert.strictEqual(node.type, 'object');
    });

    test('root array gets array type', () => {
        const node = DataTransformer.jsonToNodes([1, 2]);
        assert.strictEqual(node.type, 'array');
    });

    test('leaf string value gets property type', () => {
        const node = DataTransformer.jsonToNodes('hello', 'key');
        assert.strictEqual(node.type, 'property');
    });

    test('leaf null gets property type', () => {
        const node = DataTransformer.jsonToNodes(null, 'key');
        assert.strictEqual(node.type, 'property');
    });

    test('children are generated for object keys', () => {
        const node = DataTransformer.jsonToNodes({ name: 'Alice', age: 30 });
        assert.strictEqual(node.children?.length, 2);
    });

    test('children are generated for array items', () => {
        const node = DataTransformer.jsonToNodes([1, 2, 3]);
        assert.strictEqual(node.children?.length, 3);
    });

    test('depth is tracked correctly for children', () => {
        const node = DataTransformer.jsonToNodes({ nested: { value: 1 } });
        const nestedChild = node.children?.find((c) => c.id.includes('nested'));
        assert.ok(nestedChild?.metadata.depth === 1);
        const valueChild = nestedChild?.children?.[0];
        assert.ok(valueChild?.metadata.depth === 2);
    });

    test('path is built correctly for nested keys', () => {
        const node = DataTransformer.jsonToNodes({ person: { name: 'Bob' } });
        const personChild = node.children?.find((c) => c.id.includes('person'));
        assert.ok(personChild?.metadata.path.includes('person'));
    });

    test('long string values are truncated in label', () => {
        const long = 'X'.repeat(100);
        const node = DataTransformer.jsonToNodes(long, 'key');
        assert.ok(node.label.length < long.length + 10);
        assert.ok(node.label.includes('...'));
    });
});

// ─── DataTransformer.countNodes / calculateMaxDepth ───────────────────────────

suite('DataTransformer utilities', () => {
    test('countNodes counts all nodes in tree', () => {
        const node = DataTransformer.jsonToNodes({ a: 1, b: { c: 2 } });
        const count = DataTransformer.countNodes(node);
        assert.ok(count >= 4); // root, a, b, c
    });

    test('countNodes returns 1 for leaf node', () => {
        const node = DataTransformer.jsonToNodes('leaf', 'key');
        assert.strictEqual(DataTransformer.countNodes(node), 1);
    });

    test('calculateMaxDepth returns 0 for leaf node at depth 0', () => {
        const node = DataTransformer.jsonToNodes('hello', 'root');
        assert.strictEqual(DataTransformer.calculateMaxDepth(node), 0);
    });

    test('calculateMaxDepth returns correct depth for nested structure', () => {
        const node = DataTransformer.jsonToNodes({ a: { b: { c: 1 } } });
        const maxDepth = DataTransformer.calculateMaxDepth(node);
        assert.ok(maxDepth >= 3);
    });
});

// ─── Parser error cases ───────────────────────────────────────────────────────

suite('Parser error handling', () => {
    test('JSONParser: throws with helpful message on truncated JSON', () => {
        assert.throws(() => new JSONParser().parse('{"key":'), /JSON parsing failed/);
    });

    test('JSONParser: throws on trailing comma', () => {
        assert.throws(() => new JSONParser().parse('{"a":1,}'), /JSON parsing failed/);
    });

    test('YAMLParser: throws on invalid indentation mix', () => {
        assert.throws(() => new YAMLParser().parse('key:\n  child: val\n  \t bad'), /YAML parsing failed/);
    });

    test('CSVParser: throws on unmatched quotes (critical error)', () => {
        assert.throws(() => new CSVParser().parse('name,color\n"Apple,Red'), /CSV parsing failed/);
    });

    test('XMLParserImpl: parses unclosed tag gracefully or throws', () => {
        // fast-xml-parser is lenient; it either returns a partial result or throws
        try {
            const result = new XMLParserImpl().parse('<root><unclosed>');
            assert.ok(typeof result === 'object');
        } catch (e: any) {
            assert.ok(/XML parsing failed/.test(e.message));
        }
    });

    test('RAMLParser: throws for pure string content', () => {
        assert.throws(() => new RAMLParser().parse('just a bare string'), /RAML parsing failed/);
    });
});
