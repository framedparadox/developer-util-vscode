# Certificate Utility Tools

Certificate Utility Tools is a focused VS Code extension for inspecting X.509 certificates without leaving the editor. It provides a compact Activity Bar view plus Command Palette commands for certificate validation, decoding, conversion instructions, and expiration scanning.

## Features

### Certificate Tools

Open `Certificate Utility: Certificate Tools` from the Command Palette or the Certificates Activity Bar view.

- Validate PEM certificates and show whether they are currently valid.
- Decode X.509 certificate metadata including subject, issuer, validity dates, serial number, fingerprints, key usage, subject alternative names, and authority information.
- Generate Java `keytool` commands for exporting certificates from a JKS keystore.
- Generate OpenSSL command instructions for creating a PKCS#12 bundle from a certificate and private key.

### Certificate Expiry Checker

Open `Certificate Utility: Certificate Expiry Checker` from the Command Palette or the Certificates Activity Bar view.

- Select a folder and scan recursively for certificate files.
- Sort certificates by expiration date.
- Filter the result table by all, expiring soon, expired, and valid certificates.
- Toggle optional columns for certificate type, format, and valid-from date.

## Supported Formats

The expiry scanner parses certificate files that Node.js can read as X.509 certificates:

- `.crt`
- `.cer`
- `.cert`
- `.pem`
- `.der`
- `.ca-bundle`
- `.ca`
- `.bundle`

JKS, PKCS#12, PKCS#7, CSR, and private key files are not parsed directly by the extension. The Certificate Tools panel provides command-line instructions for JKS export and PKCS#12 creation instead.

## Commands

- `certificateUtil.openCertificateTools`: Certificate Tools
- `certificateUtil.openExpiryChecker`: Certificate Expiry Checker

## Requirements

- VS Code 1.105.0 or newer.
- Java `keytool` is required only when you run generated JKS commands.
- OpenSSL is required only when you run generated PKCS#12 commands.

## Development

```bash
npm ci
npm run lint
npm run compile
npm run compile-tests
npm test
npx vsce package --no-dependencies --out certificate-util.vsix
```

## Privacy

Certificate parsing runs locally inside VS Code. The extension does not upload certificate contents, private keys, or scan results.
