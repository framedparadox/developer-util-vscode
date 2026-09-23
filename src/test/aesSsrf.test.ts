import * as assert from 'assert';
import { isBlockedHost, isBlockedIpLiteral } from '../panels/security/aesEncryptDecryptPanel';

suite('AES URL fetch host blocking', () => {
    test('blocks loopback and localhost', () => {
        assert.strictEqual(isBlockedIpLiteral('127.0.0.1'), true);
        assert.strictEqual(isBlockedHost('localhost'), true);
        assert.strictEqual(isBlockedHost('app.localhost'), true);
        assert.strictEqual(isBlockedIpLiteral('::1'), true);
    });

    test('blocks RFC1918 and link-local addresses', () => {
        assert.strictEqual(isBlockedIpLiteral('10.1.2.3'), true);
        assert.strictEqual(isBlockedIpLiteral('192.168.1.1'), true);
        assert.strictEqual(isBlockedIpLiteral('172.16.0.1'), true);
        assert.strictEqual(isBlockedIpLiteral('169.254.169.254'), true);
    });

    test('blocks CGNAT and IETF reserved prefixes', () => {
        assert.strictEqual(isBlockedIpLiteral('100.64.0.1'), true);
        assert.strictEqual(isBlockedIpLiteral('192.0.0.1'), true);
    });

    test('allows ordinary public addresses', () => {
        assert.strictEqual(isBlockedIpLiteral('1.1.1.1'), false);
        assert.strictEqual(isBlockedHost('example.com'), false);
    });
});
