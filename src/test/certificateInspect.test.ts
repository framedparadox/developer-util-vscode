import * as assert from 'assert';
import * as crypto from 'crypto';
import {
    determineCertType,
    extractCertificateAlgorithm,
    extractCommonName,
    extractPemCertificates,
    normalizeCertificateInput,
} from '../certificates/inspect';

const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUEysiDL5+9+yeROV3t2uMA5m6C14wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJZGV2eC50ZXN0MB4XDTI2MDkxOTAxNTYwMloXDTI2MDky
MDAxNTYwMlowFDESMBAGA1UEAwwJZGV2eC50ZXN0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA4oR65d8Z6XDNaCuObJjvHdV6GPClqwhmmVyCGQ2olIkG
9hREuqWCdq5Nk9Rdox03IIaaXgD9cKBzFbXZgITk87VfJRXLSTk1MZOBb/nZI+nl
se5aMAM59xWtOC1/Q/ov+UuQiRJNATxDChSx37RxyHv58gqWWT8zmQ0Aqdt7yfic
y8+JgvxL9HbckDMFQTLj/A6271Fjm554gQToMAYUGXbeQeBMptJlnu1Wb561NiNL
CC5qBex8/b0YSHKcY3YqYoG8DnJW4JeFgBLWJTSfwwKQNmKGcyonzdiUZnUjxSiE
6YopdwO4hDx8zfp98X2Owiz71Hl4OnviuA+e/f5ILwIDAQABo1MwUTAdBgNVHQ4E
FgQUFgSLj0zCJ8lWf2g4wECospQXPFcwHwYDVR0jBBgwFoAUFgSLj0zCJ8lWf2g4
wECospQXPFcwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEASckf
NxGuR38P2gnMs7PQYmne8UwSFNORT43K5AH+l88Wkg16fshsfuvnwWgnebJPrayi
Aan/lFmQuLU2ii/Hy1C8ZngN2rZXChHGXozZ+XIL2lnAIEcwHR/kAmod9xe8cQL3
5CSruNs14IknKJFrf4DpQ0mqW2g80wciuxJzWTR9bEj02ypEpgstszzTzROaT28Q
olOgbrWbmWobGDNymsC+rjXQ3/QFXGaEh9hp4qEn+nrkbE1dUWuYo/uIyRzfEU7P
G5mjhdOjya+kR5kv335KFLGjYcC1lJNKS2UDReSuAF0VulDlZ/8sqlHRUrMPcvgN
t9PWwWibwS9sAsV+yA==
-----END CERTIFICATE-----`;

suite('certificate inspect helpers', () => {
    test('extracts all PEM blocks from a bundle', () => {
        const pem = `${TEST_CERT_PEM}\nignored text\n${TEST_CERT_PEM}`;
        assert.strictEqual(extractPemCertificates(pem).length, 2);
    });

    test('normalizeCertificateInput wraps bare base64', () => {
        const bare = `${'A'.repeat(64)}==`;
        const pems = normalizeCertificateInput(bare);
        assert.strictEqual(pems.length, 1);
        assert.match(pems[0], /BEGIN CERTIFICATE/);
    });

    test('normalizeCertificateInput rejects arbitrary text', () => {
        assert.throws(() => normalizeCertificateInput('not a certificate'), /No PEM certificate block/);
    });

    test('extractCommonName reads newline-delimited subjects', () => {
        assert.strictEqual(extractCommonName('CN=example.com\nO=Org'), 'example.com');
    });

    test('extractCommonName reads quoted common names', () => {
        assert.strictEqual(extractCommonName('CN="Acme, Inc",O=Org'), 'Acme, Inc');
    });

    test('extractCertificateAlgorithm reports RSA key size', () => {
        const cert = new crypto.X509Certificate(TEST_CERT_PEM);
        assert.match(extractCertificateAlgorithm(cert), /RSA 2048/);
        assert.strictEqual(determineCertType(cert), 'Certificate Authority');
    });
});
