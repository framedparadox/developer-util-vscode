# Developer Utility Tools

A focused set of developer utilities available from the VS Code Activity Bar and Command Palette.

## Tools

### AES Encrypt / Decrypt

- AES-128, AES-192, and AES-256
- CBC, CFB, CTR, OFB, and ECB modes
- PKCS#7, ISO 9797-1, ANSI X9.23, ISO 10126, zero, and no padding
- PBKDF2, OpenSSL-compatible EvpKDF, or explicit key/IV material
- UTF-8, hexadecimal, and Base64 input/output
- Text, file, and HTTP/HTTPS URL input
- OpenSSL `Salted__` support for derived keys

URL content is fetched only when you explicitly select URL input. AES input is limited to 10 MB.

### Base64 Encode/Decode

- Encode text or files
- Decode validated Base64 input
- Copy output to the clipboard

Base64 input is limited to 10 MB.

### JWT Debugger

- Decode Base64URL header and payload data
- Inspect the encoded signature segment
- Check a numeric `exp` claim for expiration

The debugger does not verify JWT signatures and does not establish that a token is trustworthy.

### UUID Generator

- UUID v1, v4, and v7
- Null UUID
- Bulk generation of up to 1,000 values

### Format Text

Escape and unescape JSON-style control sequences, quotes, slashes, and Unicode escapes.

### Data Formatter

- Format or minify JSON and XML
- Apply basic formatting to common SQL statements
- Configurable indentation

### Data Converter

Convert JSON, YAML, XML, CSV, and RAML input to JSON, YAML, or XML. Conversion input is limited to 10 MB, and circular YAML aliases are rejected.

### Data Visualizer

- Visualize JSON, YAML, XML, CSV, and RAML as an interactive graph
- Open from the sidebar or from a supported editor
- Pan, zoom, collapse nodes, switch themes, and export SVG
- Render guard for graphs larger than 1,500 nodes

### Certificate Tools

- Validate and decode PEM X.509 certificates
- Generate quoted POSIX `keytool` export commands
- Generate quoted POSIX OpenSSL PKCS#12 commands without collecting passwords or private-key contents
- Scan folders for PEM or DER X.509 certificate expiry information

The expiry scanner supports `.crt`, `.cer`, `.cert`, `.pem`, `.der`, `.ca-bundle`, `.ca`, and `.bundle` files.

## Privacy

Tool input is processed in the extension host. The extension does not send analytics or tool content to a service. The only network operation is the explicit HTTP/HTTPS fetch in the AES tool's URL input mode.

## Sidebar

The Developer Utilities Activity Bar view is configurable:

- Choose which tools are visible.
- Select compact, simple, comfortable, or icon-only layouts.
- Reset visibility and layout preferences to their defaults.

AES, Base64, JWT, UUID, Format Text, and Data Formatter are visible by default. Other tools can be enabled from **Developer Utilities: Configure Sidebar**.

## Requirements

- VS Code 1.105.0 or later

## Development

```bash
npm install
npm run compile-tests
npm run lint
npm test
npm run package
npm run package:vsix
```

`npm run package:vsix` runs the production build through the extension's `vscode:prepublish` hook before creating the VSIX.

## Support

Report defects and feature requests in the [GitHub issue tracker](https://github.com/framedparadox/developer-util-vscode/issues).

See [CHANGELOG.md](CHANGELOG.md) for release notes.
