# Developer Utility Tools

A VS Code extension providing essential tools for developers, including data formatting, certificate management, and various encoding/decoding utilities.

## Features

### 🔐 AES Encrypt / Decrypt (Generic)

Encrypt and decrypt content using configurable AES settings.

- **Enabled by Default**: Uses command `devx.aesEncryptDecryptGeneric` and appears in the DevX sidebar by default
- **Input Sources**: Text, File, and URL (`http`/`https`) input supported
- **Details Panel UX**: `Details` is collapsed by default; use the dropdown button on the right to expand/collapse options
- **Cipher Options**:
  - Key Sizes: `128`, `192`, `256`
  - Modes: `CBC`, `CFB`, `CTR`, `OFB`, `ECB`
  - Paddings: `Pkcs7`, `Iso97971`, `AnsiX923`, `Iso10126`, `ZeroPadding`, `NoPadding`
- **Key Types**:
  - `PBKDF2`
  - `EvpKDF`
  - `Custom` (with explicit Key/IV)
- **Derivation Controls**: Hash selection, salt type (`random` / `nosalt` / `custom`), custom iteration toggle
- **OpenSSL Salt Prefix**: Uses `Salted__` prefix when derived-key flow uses salt
- **Basic Encodings**: `UTF-8`, `Hex`, `Base64` for input/output and custom key material fields
- **Decryption Safety**: Auto-detects Base64/Hex ciphertext when decrypting text to reduce encoding mismatch issues
- **Output Actions**: Copy button in output panel

### 🔤 Base64 Encode/Decode

Encode and decode Base64 strings with support for both text and file inputs.

- **Text Mode**: Encode/decode plain text strings
- **File Mode**: Upload or drag-and-drop files for Base64 encoding
- **Copy Support**: Easy clipboard integration

### 🔑 JWT Debugger

Decode and validate JWT (JSON Web Token) tokens.

- **Token Decoding**: View header, payload, and signature components
- **Expiration Check**: Validates token expiration timestamps
- **Pretty Print**: Formatted JSON output for easy reading

### 🆔 UUID Generator

Generate UUIDs in multiple formats for various use cases.

- **UUID v1**: Timestamp-based UUIDs
- **UUID v4**: Random UUIDs
- **UUID v7**: Timestamp-ordered UUIDs (ideal for database primary keys)
- **Null UUID**: Generate empty UUID (00000000-0000-0000-0000-000000000000)
- **Bulk Generation**: Generate up to 1000 UUIDs at once

### 🔤 Escape/Unescape Tool

Format text by escaping or unescaping special characters.

- **Supported Characters**:
  - `\n` - Newline
  - `\r` - Carriage return
  - `\t` - Tab
  - `\f` - Form feed
  - `\b` - Backspace
  - `\"` - Double quote
  - `\'` - Single quote
  - `\\` - Backslash

### 📄 Data Formatter

Format and beautify XML, JSON, and SQL code.

- **XML Formatting**: Pretty-print or minify XML documents
- **JSON Formatting**: Format JSON with customizable indentation (2-8 spaces)
- **SQL Formatting**: Auto-format SQL queries with proper indentation
- **Minify Support**: Compress XML and JSON (remove whitespace)

### 🔐 Certificate Tools

Comprehensive certificate management utilities.

- **Validate Certificates**: Check certificate validity, expiration, and format
- **Decode Certificates**: Extract detailed certificate information (subject, issuer, fingerprint, etc.)
- **JKS Extraction**: Instructions for extracting certificates from Java KeyStore
- **PKCS12 Conversion**: Generate OpenSSL commands to convert certificates to PKCS12 format

### 🎯 Activity Bar Integration

Access all Utility tools from the dedicated activity bar icon for quick navigation.

## Requirements

- VS Code version 1.105.0 or higher
- Node.js (for development)

## Extension Settings

This extension does not currently add any VS Code settings. Configuration is done through the UI panels.

## Encryption Details

### Generic AES Mode (`devx.aesEncryptDecryptGeneric`)

- **AES Modes**: `CBC`, `CFB`, `CTR`, `OFB`, `ECB`
- **Key Sizes**: `128`, `192`, `256`
- **KDF Types**: `PBKDF2`, `EvpKDF`, or `Custom Key/IV`
- **Hash Algorithms**: `MD5`, `SHA1`, `SHA224`, `SHA256`, `SHA384`, `SHA512`, `RIPEMD160`
- **Salt Types**: Random, No Salt, or Custom (8-byte salt)
- **Iteration Defaults**:
  - `PBKDF2`: `10000`
  - `EvpKDF`: `1`
- **Custom Iteration**: Optional override via Details panel
- **Encodings**: `UTF-8`, `Hex`, `Base64`
- **Input Types**: Text / File / URL
- **URL Fetching**: Host-side `http`/`https` fetch with timeout and redirect handling

## Known Issues

None at this time. Please report issues on the [GitHub repository](https://github.com/framedparadox/VSCodeExtension/issues).

## Release Notes

### Unreleased

- Added **AES Encrypt / Decrypt (Generic)** as a separate tool (`devx.aesEncryptDecryptGeneric`)
- Added advanced AES options: key size, mode, padding, key type, hash, salt type, custom iteration
- Added Text/File/URL input support for generic AES
- Added Details panel dropdown toggle (collapsed by default)
- Added decrypt input auto-detection for Base64/Hex text flows

### 0.0.1

Initial release of Developer Utility Tools with the following features:

- Base64 Encode/Decode with file upload support
- JWT Debugger with token validation
- UUID Generator (v1, v4, v7, Null) with bulk generation
- Escape/Unescape tool for special characters
- Data Formatter for XML, JSON, and SQL
- Certificate Tools for validation, decoding, and conversion
- Status / Healthcheck for monitoring service availability
- Activity bar integration
- Copy to clipboard functionality across all tools

---

## For Developers

This extension is designed to streamline development workflows with data formatting, conversion, certificate, encoding, and debugging tools directly within VS Code.

---

**Enjoy development!**
