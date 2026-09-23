import * as assert from 'assert';
import { MAX_INPUT_BYTES, assertInputSize, normalizeIndent, normalizeTabSize } from '../limits';

suite('input limits', () => {
    test('accepts text within the size limit', () => {
        assert.strictEqual(assertInputSize('hello', 'Text'), 'hello');
    });

    test('rejects non-text input', () => {
        assert.throws(() => assertInputSize(123 as unknown as string, 'Text'), /must be text/);
    });

    test('rejects oversized input', () => {
        assert.throws(() => assertInputSize(' '.repeat(MAX_INPUT_BYTES + 1), 'Text'), /10 MB limit/);
    });

    test('normalizes indent values in range', () => {
        assert.strictEqual(normalizeIndent(4), 4);
    });

    test('rejects hostile indent values', () => {
        assert.throws(() => normalizeIndent(-1), /Indent must be an integer/);
        assert.throws(() => normalizeIndent(1e8), /Indent must be an integer/);
        assert.throws(() => normalizeIndent('nope'), /Indent must be an integer/);
    });

    test('normalizes allowed tab sizes', () => {
        assert.strictEqual(normalizeTabSize('8'), 8);
    });

    test('rejects invalid tab sizes', () => {
        assert.throws(() => normalizeTabSize(0), /Tab size must be 2, 4, or 8/);
        assert.throws(() => normalizeTabSize(3), /Tab size must be 2, 4, or 8/);
    });
});
