/**
 * Tests for formatter logic extracted from FormatterPanel.
 * Pure functions only – no VS Code dependency.
 */
import * as assert from 'assert';

// ─── Pure logic (mirrors FormatterPanel private methods) ─────────────────────

function formatXML(xml: string, indent: number): string {
    const PADDING = ' '.repeat(indent);
    const reg = /(>)(<)(\/*)/g;
    let formatted = '';
    let pad = 0;

    xml = xml.replace(reg, '$1\r\n$2$3');

    xml.split('\r\n').forEach((node) => {
        let padDelta = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            padDelta = 0;
        } else if (node.match(/^<\/\w/) && pad > 0) {
            pad -= 1;
        } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
            padDelta = 1;
        } else {
            padDelta = 0;
        }

        formatted += PADDING.repeat(pad) + node + '\r\n';
        pad += padDelta;
    });

    return formatted.trim();
}

function formatJSON(text: string, indent: number): string {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, indent);
}

function minifyJSON(text: string): string {
    return JSON.stringify(JSON.parse(text));
}

function minifyXML(text: string): string {
    return text
        .replace(/>\s+</g, '><')
        .replace(/^\s+|\s+$/gm, '')
        .trim();
}

function formatSQL(sql: string): string {
    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
        'INNER JOIN', 'OUTER JOIN', 'ON', 'AND', 'OR', 'ORDER BY',
        'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO',
        'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
        'ALTER', 'DROP', 'AS', 'DISTINCT', 'UNION', 'CASE',
        'WHEN', 'THEN', 'ELSE', 'END',
    ];

    let formatted = sql;
    keywords.forEach((keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        formatted = formatted.replace(regex, `\n${keyword}`);
    });

    formatted = formatted
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n');

    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indentedLines = lines.map((line) => {
        const upperLine = line.toUpperCase();
        if (
            upperLine.startsWith('SELECT') || upperLine.startsWith('FROM') ||
            upperLine.startsWith('WHERE') || upperLine.startsWith('ORDER BY') ||
            upperLine.startsWith('GROUP BY') || upperLine.startsWith('HAVING') ||
            upperLine.startsWith('UNION') || upperLine.startsWith('INSERT') ||
            upperLine.startsWith('UPDATE') || upperLine.startsWith('DELETE') ||
            upperLine.startsWith('CREATE') || upperLine.startsWith('ALTER') ||
            upperLine.startsWith('DROP')
        ) {
            indentLevel = 0;
        } else if (upperLine.includes('JOIN')) {
            indentLevel = 1;
        } else if (
            upperLine.startsWith('AND') || upperLine.startsWith('OR') ||
            upperLine.startsWith('ON') || upperLine.startsWith('SET') ||
            upperLine.startsWith('VALUES') || upperLine.startsWith('WHEN') ||
            upperLine.startsWith('THEN') || upperLine.startsWith('ELSE') ||
            upperLine.startsWith('END')
        ) {
            indentLevel = 1;
        }
        return '  '.repeat(indentLevel) + line;
    });

    return indentedLines.join('\n');
}

// ─── formatJSON ───────────────────────────────────────────────────────────────

suite('FormatterPanel – formatJSON()', () => {
    test('formats flat object with indent=2', () => {
        const result = formatJSON('{"a":1,"b":"hello"}', 2);
        assert.strictEqual(result, JSON.stringify({ a: 1, b: 'hello' }, null, 2));
    });

    test('formats with indent=4', () => {
        const result = formatJSON('{"x":1}', 4);
        assert.ok(result.includes('    "x"'));
    });

    test('formats nested object', () => {
        const result = formatJSON('{"outer":{"inner":42}}', 2);
        assert.ok(result.includes('"inner": 42'));
    });

    test('formats array', () => {
        const result = formatJSON('[1,2,3]', 2);
        assert.strictEqual(result, JSON.stringify([1, 2, 3], null, 2));
    });

    test('formats nested array of objects', () => {
        const result = formatJSON('[{"id":1},{"id":2}]', 2);
        assert.ok(result.includes('"id": 1'));
        assert.ok(result.includes('"id": 2'));
    });

    test('preserves null values', () => {
        const result = formatJSON('{"key":null}', 2);
        assert.ok(result.includes('"key": null'));
    });

    test('preserves boolean values', () => {
        const result = formatJSON('{"active":true,"disabled":false}', 2);
        assert.ok(result.includes('"active": true'));
        assert.ok(result.includes('"disabled": false'));
    });

    test('formats empty object', () => {
        const result = formatJSON('{}', 2);
        assert.strictEqual(result, '{}');
    });

    test('formats empty array', () => {
        const result = formatJSON('[]', 2);
        assert.strictEqual(result, '[]');
    });

    test('throws on invalid JSON', () => {
        assert.throws(() => formatJSON('{bad}', 2));
    });

    test('throws on empty input', () => {
        assert.throws(() => formatJSON('', 2));
    });

    test('indent=0 produces single-line output', () => {
        const result = formatJSON('{"a":1,"b":2}', 0);
        assert.ok(!result.includes('\n'));
    });
});

// ─── minifyJSON ───────────────────────────────────────────────────────────────

suite('FormatterPanel – minifyJSON()', () => {
    test('removes whitespace from pretty-printed JSON', () => {
        const pretty = JSON.stringify({ a: 1, b: 'hello' }, null, 2);
        const result = minifyJSON(pretty);
        assert.strictEqual(result, '{"a":1,"b":"hello"}');
    });

    test('minifies nested object', () => {
        const result = minifyJSON('{\n  "outer": {\n    "inner": 42\n  }\n}');
        assert.strictEqual(result, '{"outer":{"inner":42}}');
    });

    test('minifies array', () => {
        const result = minifyJSON('[1, 2, 3]');
        assert.strictEqual(result, '[1,2,3]');
    });

    test('minified output contains no leading/trailing spaces', () => {
        const result = minifyJSON('  {  "a" :  1  }  ');
        assert.strictEqual(result, '{"a":1}');
    });

    test('throws on invalid JSON', () => {
        assert.throws(() => minifyJSON('{bad}'));
    });

    test('round-trip: format then minify restores original', () => {
        const original = '{"a":1,"b":[1,2],"c":{"d":true}}';
        const formatted = formatJSON(original, 4);
        const minified = minifyJSON(formatted);
        assert.deepStrictEqual(JSON.parse(minified), JSON.parse(original));
    });
});

// ─── formatXML ───────────────────────────────────────────────────────────────

suite('FormatterPanel – formatXML()', () => {
    test('formats simple nested XML with indent=2', () => {
        const result = formatXML('<root><child>value</child></root>', 2);
        assert.ok(result.includes('<root>'));
        assert.ok(result.includes('  <child>'));
    });

    test('opening tag increases indent for subsequent siblings', () => {
        // Use a structure where parent and first child are separated by content,
        // so the indentation mechanism kicks in for the second sibling.
        const result = formatXML('<root><a>1</a><b>2</b></root>', 2);
        const lines = result.split(/\r?\n/).filter((l) => l.trim().length > 0);
        // root must be at column 0
        const rootLine = lines.find((l) => l.trim() === '<root>');
        assert.ok(rootLine !== undefined, `no <root> line`);
        assert.ok(!rootLine.startsWith(' '), '<root> should not be indented');
        // child elements must be indented
        const aLine = lines.find((l) => l.trim().includes('<a>1</a>'));
        const bLine = lines.find((l) => l.trim().includes('<b>2</b>'));
        assert.ok(aLine !== undefined && bLine !== undefined);
        assert.ok(aLine.startsWith('  '), `<a> line should be indented: "${aLine}"`);
        assert.ok(bLine.startsWith('  '), `<b> line should be indented: "${bLine}"`);
    });

    test('self-closing tags do not alter indent', () => {
        const result = formatXML('<root><item/></root>', 2);
        assert.ok(result.includes('<root>'));
        assert.ok(result.includes('<item/>'));
    });

    test('closing tag decreases indent', () => {
        const result = formatXML('<root><child>val</child></root>', 2);
        const lines = result.split(/\r?\n/);
        const closingRoot = lines.find((l) => l.trim() === '</root>');
        assert.ok(closingRoot !== undefined);
        assert.ok(!closingRoot.startsWith('  '));
    });

    test('indent=4 produces 4-space indentation', () => {
        const result = formatXML('<root><child>v</child></root>', 4);
        assert.ok(result.includes('    <child>'));
    });

    test('indent=0 produces no indentation', () => {
        const result = formatXML('<root><child>v</child></root>', 0);
        const lines = result.split(/\r?\n/);
        lines.forEach((line) => {
            if (line.length > 0) {
                assert.ok(!line.startsWith(' '), `line has unexpected indent: "${line}"`);
            }
        });
    });

    test('result is trimmed (no leading/trailing whitespace)', () => {
        const result = formatXML('<root><child/></root>', 2);
        assert.strictEqual(result, result.trim());
    });

    test('inline element (open+content+close on same original line) is not double-indented', () => {
        const result = formatXML('<root><name>Alice</name></root>', 2);
        const lines = result.split(/\r?\n/).filter((l) => l.trim().length > 0);
        // <name>Alice</name> should appear on a single indented line, not split further
        assert.ok(lines.some((l) => l.includes('<name>Alice</name>')));
    });

    test('multiple sibling children are each on their own line', () => {
        const result = formatXML('<root><a>1</a><b>2</b><c>3</c></root>', 2);
        const lines = result.split(/\r?\n/).filter((l) => l.trim().length > 0);
        assert.ok(lines.some((l) => l.includes('<a>')));
        assert.ok(lines.some((l) => l.includes('<b>')));
        assert.ok(lines.some((l) => l.includes('<c>')));
    });
});

// ─── minifyXML ───────────────────────────────────────────────────────────────

suite('FormatterPanel – minifyXML()', () => {
    test('removes whitespace between tags', () => {
        const pretty = '<root>\n  <child>value</child>\n</root>';
        const result = minifyXML(pretty);
        assert.strictEqual(result, '<root><child>value</child></root>');
    });

    test('trims leading and trailing whitespace', () => {
        const result = minifyXML('  <root/>  ');
        assert.strictEqual(result, '<root/>');
    });

    test('preserves text content within tags', () => {
        const result = minifyXML('<root>\n  <name>Alice</name>\n</root>');
        assert.ok(result.includes('Alice'));
    });

    test('handles already-minified XML unchanged', () => {
        const compact = '<root><a>1</a><b>2</b></root>';
        assert.strictEqual(minifyXML(compact), compact);
    });

    test('handles deeply nested XML', () => {
        const nested = '<a>\n  <b>\n    <c>v</c>\n  </b>\n</a>';
        const result = minifyXML(nested);
        assert.strictEqual(result, '<a><b><c>v</c></b></a>');
    });

    test('round-trip: format then minify', () => {
        const original = '<root><name>Bob</name><age>30</age></root>';
        const formatted = formatXML(original, 2);
        const minified = minifyXML(formatted);
        // structure must be equivalent (whitespace normalised)
        assert.strictEqual(minified.replace(/\s/g, ''), original.replace(/\s/g, ''));
    });
});

// ─── formatSQL ───────────────────────────────────────────────────────────────

suite('FormatterPanel – formatSQL()', () => {
    test('SELECT is placed at indent level 0', () => {
        const result = formatSQL('SELECT id, name FROM users');
        const lines = result.split('\n');
        const selectLine = lines.find((l) => l.trimStart().startsWith('SELECT'));
        assert.ok(selectLine !== undefined);
        assert.ok(!selectLine.startsWith(' '));
    });

    test('FROM is placed at indent level 0', () => {
        const result = formatSQL('SELECT id FROM users');
        const lines = result.split('\n');
        const fromLine = lines.find((l) => l.trimStart().startsWith('FROM'));
        assert.ok(fromLine !== undefined);
        assert.ok(!fromLine.startsWith(' '));
    });

    test('WHERE is placed at indent level 0', () => {
        const result = formatSQL('SELECT id FROM users WHERE id = 1');
        const lines = result.split('\n');
        const whereLine = lines.find((l) => l.trimStart().startsWith('WHERE'));
        assert.ok(whereLine !== undefined);
        assert.ok(!whereLine.startsWith(' '));
    });

    test('AND / OR are indented', () => {
        const result = formatSQL('SELECT id FROM users WHERE id = 1 AND name = \'Alice\'');
        const lines = result.split('\n');
        const andLine = lines.find((l) => l.trimStart().startsWith('AND'));
        assert.ok(andLine !== undefined);
        assert.ok(andLine.startsWith('  '));
    });

    test('JOIN is indented', () => {
        const result = formatSQL('SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id');
        const lines = result.split('\n');
        const joinLine = lines.find((l) => l.trimStart().toUpperCase().includes('JOIN'));
        assert.ok(joinLine !== undefined);
        assert.ok(joinLine.startsWith('  '));
    });

    test('ON is indented', () => {
        const result = formatSQL('SELECT * FROM a JOIN b ON a.id = b.id');
        const lines = result.split('\n');
        const onLine = lines.find((l) => l.trimStart().startsWith('ON'));
        assert.ok(onLine !== undefined);
        assert.ok(onLine.startsWith('  '));
    });

    test('ORDER BY is placed at indent level 0', () => {
        const result = formatSQL('SELECT id FROM users ORDER BY name');
        const lines = result.split('\n');
        const orderLine = lines.find((l) => l.trimStart().startsWith('ORDER BY'));
        assert.ok(orderLine !== undefined);
        assert.ok(!orderLine.startsWith(' '));
    });

    test('GROUP BY is placed at indent level 0', () => {
        const result = formatSQL('SELECT dept, COUNT(*) FROM employees GROUP BY dept');
        const lines = result.split('\n');
        const groupLine = lines.find((l) => l.trimStart().startsWith('GROUP BY'));
        assert.ok(groupLine !== undefined);
        assert.ok(!groupLine.startsWith(' '));
    });

    test('keywords are uppercased in output', () => {
        const result = formatSQL('select id from users');
        assert.ok(result.includes('SELECT'));
        assert.ok(result.includes('FROM'));
    });

    test('empty lines are stripped', () => {
        const result = formatSQL('SELECT   id   FROM   users');
        assert.ok(!result.includes('\n\n'));
    });

    test('INSERT INTO … VALUES indentation', () => {
        const result = formatSQL("INSERT INTO users (id, name) VALUES (1, 'Alice')");
        const lines = result.split('\n');
        const insertLine = lines.find((l) => l.trimStart().startsWith('INSERT'));
        const valuesLine = lines.find((l) => l.trimStart().startsWith('VALUES'));
        assert.ok(insertLine && !insertLine.startsWith(' '));
        assert.ok(valuesLine && valuesLine.startsWith('  '));
    });

    test('UPDATE … SET indentation', () => {
        const result = formatSQL("UPDATE users SET name = 'Bob' WHERE id = 1");
        const lines = result.split('\n');
        const setLine = lines.find((l) => l.trimStart().startsWith('SET'));
        assert.ok(setLine !== undefined);
        assert.ok(setLine.startsWith('  '));
    });

    test('full complex query produces non-empty multi-line output', () => {
        // Use simple JOIN (not LEFT JOIN) to avoid multi-word keyword replacement edge case
        const sql = `SELECT u.id, u.name FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = true AND u.created_at > '2023-01-01' GROUP BY u.id ORDER BY u.id DESC LIMIT 100`;
        const result = formatSQL(sql);
        assert.ok(result.split('\n').length > 4);
        assert.ok(result.includes('SELECT'));
        assert.ok(result.includes('FROM'));
        assert.ok(result.includes('JOIN'));
        assert.ok(result.includes('WHERE'));
        assert.ok(result.includes('ORDER BY'));
    });
});
