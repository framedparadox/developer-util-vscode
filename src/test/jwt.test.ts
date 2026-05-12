/**
 * Tests for JWT decode logic extracted from JWTPanel.
 * Pure decode logic only – no VS Code dependency.
 */
import * as assert from 'assert';

// ─── Pure logic (mirrors JWTPanel.handleDecode) ───────────────────────────────

interface JWTDecodeResult {
    header: object;
    payload: object;
    signature: string;
    isExpired: boolean;
    expirationInfo: string;
}

function decodeJWT(token: string): JWTDecodeResult {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT token format. Expected 3 parts separated by dots.');
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    const signature = parts[2];

    let isExpired = false;
    let expirationInfo = '';
    if ((payload as any).exp) {
        const expDate = new Date((payload as any).exp * 1000);
        isExpired = expDate < new Date();
        expirationInfo = `Expires: ${expDate.toLocaleString()} (${isExpired ? 'EXPIRED' : 'Valid'})`;
    }

    return { header, payload, signature, isExpired, expirationInfo };
}

// ─── Helper: build a JWT-style token from parts ───────────────────────────────

function buildToken(header: object, payload: object, signature = 'fakesig'): string {
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${h}.${p}.${signature}`;
}

// ─── decodeJWT ───────────────────────────────────────────────────────────────

suite('JWTPanel – decodeJWT()', () => {
    test('decodes header fields correctly', () => {
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1234', name: 'Alice' });
        const result = decodeJWT(token);
        assert.deepStrictEqual(result.header, { alg: 'HS256', typ: 'JWT' });
    });

    test('decodes payload fields correctly', () => {
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1234', name: 'Alice', admin: true });
        const result = decodeJWT(token);
        assert.deepStrictEqual(result.payload, { sub: '1234', name: 'Alice', admin: true });
    });

    test('preserves signature as-is', () => {
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1' }, 'mysignature');
        const result = decodeJWT(token);
        assert.strictEqual(result.signature, 'mysignature');
    });

    test('no exp claim: isExpired=false and expirationInfo is empty', () => {
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '123' });
        const result = decodeJWT(token);
        assert.strictEqual(result.isExpired, false);
        assert.strictEqual(result.expirationInfo, '');
    });

    test('future exp claim: isExpired=false', () => {
        const futureExp = Math.floor(Date.now() / 1000) + 3600; // +1 hour
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1', exp: futureExp });
        const result = decodeJWT(token);
        assert.strictEqual(result.isExpired, false);
        assert.ok(result.expirationInfo.includes('Valid'));
    });

    test('past exp claim: isExpired=true', () => {
        const pastExp = Math.floor(Date.now() / 1000) - 3600; // -1 hour
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1', exp: pastExp });
        const result = decodeJWT(token);
        assert.strictEqual(result.isExpired, true);
        assert.ok(result.expirationInfo.includes('EXPIRED'));
    });

    test('expirationInfo mentions the expiry date', () => {
        const futureExp = Math.floor(Date.now() / 1000) + 7200;
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1', exp: futureExp });
        const result = decodeJWT(token);
        assert.ok(result.expirationInfo.startsWith('Expires:'));
    });

    test('decodes RS256 header algorithm', () => {
        const token = buildToken({ alg: 'RS256', typ: 'JWT' }, { sub: '42' });
        const result = decodeJWT(token);
        assert.strictEqual((result.header as any).alg, 'RS256');
    });

    test('decodes payload with iat (issued-at) claim', () => {
        const iat = Math.floor(Date.now() / 1000) - 60;
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1', iat });
        const result = decodeJWT(token);
        assert.strictEqual((result.payload as any).iat, iat);
    });

    test('decodes payload with nbf (not-before) claim', () => {
        const nbf = Math.floor(Date.now() / 1000) - 60;
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { sub: '1', nbf });
        const result = decodeJWT(token);
        assert.strictEqual((result.payload as any).nbf, nbf);
    });

    test('decodes payload with nested claims object', () => {
        const payload = { sub: '1', roles: ['admin', 'user'], meta: { dept: 'eng' } };
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, payload);
        const result = decodeJWT(token);
        assert.deepStrictEqual((result.payload as any).roles, ['admin', 'user']);
        assert.strictEqual((result.payload as any).meta.dept, 'eng');
    });

    test('decodes token with unicode payload', () => {
        const token = buildToken({ alg: 'HS256', typ: 'JWT' }, { name: '日本語' });
        const result = decodeJWT(token);
        assert.strictEqual((result.payload as any).name, '日本語');
    });

    test('throws on token with only 2 parts', () => {
        assert.throws(() => decodeJWT('header.payload'), /Invalid JWT token format/);
    });

    test('throws on token with 4 parts', () => {
        assert.throws(() => decodeJWT('a.b.c.d'), /Invalid JWT token format/);
    });

    test('throws on empty string', () => {
        assert.throws(() => decodeJWT(''), /Invalid JWT token format/);
    });

    test('throws on token with invalid base64 header', () => {
        assert.throws(() => decodeJWT('!!!.eyJzdWIiOiIxIn0.sig'));
    });

    test('throws on token with non-JSON payload', () => {
        const validHeader = Buffer.from('{"alg":"HS256"}').toString('base64url');
        const badPayload = Buffer.from('not json').toString('base64url');
        assert.throws(() => decodeJWT(`${validHeader}.${badPayload}.sig`));
    });

    test('decodes token with empty payload object', () => {
        const token = buildToken({ alg: 'none', typ: 'JWT' }, {});
        const result = decodeJWT(token);
        assert.deepStrictEqual(result.payload, {});
        assert.strictEqual(result.isExpired, false);
    });
});
