# Changelog

All notable changes to Developer Utility Tools are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses semantic versioning.

## [0.0.5] - Unreleased

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
