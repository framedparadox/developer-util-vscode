import * as assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    getCertificateStatus,
    normalizePem,
    parseCertificateContent,
    parseCertificateFile,
    scanCertificateFile,
} from '../certificates/certificateUtils';

const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDWTCCAkGgAwIBAgIULf+FGy1Eryb2n8Pay9JWk3e7/OowDQYJKoZIhvcNAQEL
BQAwPDEhMB8GA1UEAwwYQ2VydGlmaWNhdGUgVXRpbGl0eSBUZXN0MRcwFQYDVQQK
DA5GcmFtZWQgUGFyYWRveDAeFw0yNjA2MTgwMjE4MTJaFw0zNjA2MTUwMjE4MTJa
MDwxITAfBgNVBAMMGENlcnRpZmljYXRlIFV0aWxpdHkgVGVzdDEXMBUGA1UECgwO
RnJhbWVkIFBhcmFkb3gwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCe
cN9rD9wBc1KUOxddMzGeEdEqNF23maBtfIZCrKzwMvWJ6wIs2iLzcfY8zRKH/qBl
CchR+TgyXPMdd6QHnRkSs4IjQvQ2ZOwQepZUp7mXKIfTGMQihF7GIsjz0fXWkMha
53jPNoMNHQFktuyJGkTwTvHH9ZZG+Yg34yjTrN4GtxzgTK1JqCnxrZ6QORtLChEL
NiSaRz/ec9cScechomnkf8ypEU65k6Y2+4jrBi09a+G8AGK3FXST9BIN6rRXFCnU
ieBHqFzIOy+JhwSKg1KKg2sWXXAtuwPPg9ydAeVVN5/5w4jEgoNfMUGj8cm0DMbf
7a7FmpeCQOmLoX5QQwv3AgMBAAGjUzBRMB0GA1UdDgQWBBRoAfRzr7XlJFHY9j2F
21Idvj8qODAfBgNVHSMEGDAWgBRoAfRzr7XlJFHY9j2F21Idvj8qODAPBgNVHRMB
Af8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQA287dmciToQLBOUrJJtSvjFkrP
sYE9zUKnMMQWWWg3Wbp2PkQZCvN0UM7SJ2C7HMAM/kSLMCkZbuGXz+ra5KPLrDm+
4bJ8GXgqZ8D17PeQsJ2tjOIeWqx8xMs3kx5mLDYwBpWMgKuXJPNoY0eEehK5sI6R
PfVWkkTTAviyRHgJm+4DltVZGaSGckjL+ua9ob8b6aY5duuIwfcxD3fKS2dUMlVH
AFTKTSStz8JoQA8q6iP65bFgMjhJG+zAmAO2HZ1wRU/MbLruigujn5ijfOqDE/kd
AT1u1KQZKfpZSNslLQjTuo/aingzQyUBbnhkdWk/3pG9ARJEkG9x2LgnQD25
-----END CERTIFICATE-----`;

suite('certificateUtils', () => {
    test('normalizes bare certificate base64 into PEM', () => {
        const body = TEST_CERT_PEM.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
        const normalized = normalizePem(body);

        assert.ok(normalized.startsWith('-----BEGIN CERTIFICATE-----'));
        assert.ok(normalized.endsWith('-----END CERTIFICATE-----'));
        assert.ok(normalized.includes(body.slice(0, 64)));
    });

    test('leaves existing PEM certificate text intact apart from trimming', () => {
        assert.strictEqual(normalizePem(`\n${TEST_CERT_PEM}\n`), TEST_CERT_PEM);
    });

    test('decodes a PEM X.509 certificate', () => {
        const details = parseCertificateContent(TEST_CERT_PEM, 'PEM');

        assert.strictEqual(details.subjectCommonName, 'Certificate Utility Test');
        assert.strictEqual(details.issuerCommonName, 'Certificate Utility Test');
        assert.strictEqual(details.format, 'PEM');
        assert.ok(details.serialNumber.length > 0);
        assert.ok(details.fingerprint.includes(':'));
    });

    test('parses DER certificate content', () => {
        const der = new crypto.X509Certificate(TEST_CERT_PEM).raw;
        const details = parseCertificateContent(der, 'DER');

        assert.strictEqual(details.subjectCommonName, 'Certificate Utility Test');
        assert.strictEqual(details.format, 'DER');
    });

    test('classifies expiry status relative to a reference date', () => {
        const reference = new Date('2026-06-17T00:00:00Z');

        assert.strictEqual(getCertificateStatus('2026-06-16T00:00:00Z', reference), 'expired');
        assert.strictEqual(getCertificateStatus('2026-07-01T00:00:00Z', reference), 'expiring');
        assert.strictEqual(getCertificateStatus('2026-08-01T00:00:00Z', reference), 'valid');
    });

    test('parses and scans a PEM certificate file', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-util-test-'));
        const certPath = path.join(tempDir, 'server.crt');
        fs.writeFileSync(certPath, TEST_CERT_PEM);

        const details = parseCertificateFile(certPath);
        const scanned = scanCertificateFile(certPath);

        assert.strictEqual(details.subjectCommonName, 'Certificate Utility Test');
        assert.strictEqual(scanned.owner, 'Certificate Utility Test');
        assert.strictEqual(scanned.format, 'CRT');
    });

    test('rejects invalid certificate content', () => {
        assert.throws(() => parseCertificateContent('not a certificate', 'PEM'));
    });

    test('reports unsupported PKCS#12 and JKS files instead of attempting to parse them', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-util-test-'));
        const p12Path = path.join(tempDir, 'bundle.p12');
        const jksPath = path.join(tempDir, 'keystore.jks');
        fs.writeFileSync(p12Path, 'placeholder');
        fs.writeFileSync(jksPath, 'placeholder');

        assert.throws(() => parseCertificateFile(p12Path), /not supported/);
        assert.throws(() => parseCertificateFile(jksPath), /not supported/);
    });
});
