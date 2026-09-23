# Changelog

All notable changes to Developer Utility Tools are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses semantic versioning.

## [0.0.5] - Unreleased

### Added

- Added the offline utility catalog: URL and HTML encoding, hex and binary, Base32 and Base58, Unicode escapes, punycode, gzip, data URIs, query strings, hashes, HMAC, passwords, tokens, scrypt, key pairs, TOTP, Basic auth, JWT signing, ULID, Nano ID, Snowflake IDs, timestamps, number bases, color, contrast, case, slugs, cron, chmod, IPv4 subnets, IPv6 ULA prefixes, MAC addresses, SemVer, CSS units, byte units, Roman numerals, regex, globs, text diff, text statistics, line tools, lorem ipsum, Markdown preview, ASCII, NATO spelling, JSONPath, JSON to TypeScript, env/INI/properties, CSS, HTML, URL and user-agent parsing, MIME types, HTTP status codes, QR codes, random ports, key codes, device info, gitignore starters, and CORS header drafts.
- Added a sidebar filter so the full tool list stays searchable.
- Added 32 tools found in IT-Tools, DevToys, CyberChef, and transform.tools but missing here: JSON Diff (with JSON Patch output), JSON / CSV, TOML Converter, JSON to Code (Go, Rust, Python, Java, C#, Kotlin, Swift, Zod, JSON Schema), JSON Toolkit, Docker Run to Compose, cURL Converter, List Converter, Mock Data Generator, Math Evaluator, Percentage Calculator, Unit Converter, ETA Calculator, Date Calculator, Time Zone Converter, Bcrypt, Password Strength, CRC / Checksum, Classic Ciphers, String Obfuscator, IBAN / Card / ISBN Validator, String Escape, Numeronym Generator, Morse Code, Hex Dump, Cheatsheets, Meta Tag Generator, Safe Link Decoder, Email Normalizer, SVG Placeholder, IPv4 Range / Converter, and CSP Analyzer.
- Added random MAC address generation to MAC Address.

### Fixed

- Stopped circular YAML/JSON from overflowing the visualizer stack.
- Parsed JSONC (comments and trailing commas) for the editor Visualize action.
- Decoded Base64 from the selected file instead of the output textarea.
- Kept `LEFT JOIN` / `RIGHT JOIN` together and skipped SQL keywords inside strings.
- Validated formatter indent, escape tab size, and input size on the extension host.
- Scanned only the folder chosen in the certificate expiry dialog and reported public-key algorithms.
- Evaluated JWT `nbf` and stopped labeling unverified tokens as `VALID`.
- Made UUID v7 same-millisecond values monotonic and tested the real generator.
- Saved converter downloads through `showSaveDialog` and used `path.basename` on Windows paths.
- Added `.vscodeignore`, a real `.gitignore`, and `tsc --noEmit` before publish.

## [0.0.4] - Unreleased

### Changed

- Repositioned the extension as a general-purpose developer utility suite.
- Standardized product naming, command categories, Activity Bar labels, repository links, and documentation.
- Replaced certificate password/content collection with safe `keytool` and OpenSSL command generation.
- Limited large AES, converter, visualizer, certificate-scan, and graph workloads.
- Updated runtime and build dependencies to patched versions.

### Fixed

- Bundled D3 with the extension so Data Visualizer works in installed VSIX packages.
- Made `.gitignore`, `.vscodeignore`, and local launch configuration available to clean clones.
- Rejected malformed Base64 input instead of silently decoding partial data.
- Validated JWT object structure and numeric expiration claims, while clarifying that signatures are not verified.
- Escaped certificate values and converter errors before rendering them in webviews.
- Restricted sidebar webview messages to contributed commands and validated persisted preferences.
- Rejected circular YAML aliases and stopped graph construction at the render limit.
- Removed unsupported PKCS#7, PKCS#12, private-key, and CSR claims from the certificate expiry scanner.
- Corrected certificate common-name, type, and signature-algorithm reporting.

## [0.0.3]

### Changed

- Removed the MuleSoft-specific AES tool and KeyIdentifier settings.
- Enabled the generic AES tool by default and moved it above Certificate Tools.
