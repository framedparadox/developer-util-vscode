# MuleSoft AES Encrypt / Decrypt

A focused VS Code extension for encrypting and decrypting MuleSoft secure
configuration properties using AES, fully compatible with MuleSoft's secure
properties format.

## Features

### 🔒 Mulesoft AES Encrypt / Decrypt

Encrypt and decrypt sensitive configuration properties using AES encryption,
fully compatible with MuleSoft's secure properties format.

- **MuleSoft Compatible**: Uses AES/CBC/PKCS5 encryption with output in `![base64]` format
- **Quick Access**: Button appears in editor toolbar when working with YAML or `.properties` files
- **KeyIdentifier Presets**: Built-in encryption keys for DEV, FIT, UAT, and PROD KeyIdentifiers
- **Secure Key Management**: Toggle visibility to show/hide encryption keys with partial masking
- **Copy to Clipboard**: One-click copy of encrypted values

### 🎯 Activity Bar Integration

Access the AES tool and settings from the dedicated DevX activity bar icon.

## Requirements

- VS Code version 1.105.0 or higher
- Node.js (for development)

## Extension Settings

Configuration is done through the **Settings** panel (available from the DevX
sidebar):

- **AES KeyIdentifier Settings**: Configure the encryption key for each
  KeyIdentifier (DEV, FIT, UAT, PROD, or your own). Keys are stored securely in
  VS Code's secret storage and are never sent anywhere.
- **Display Mode**: Compact sidebar layout (icon + title + description inline).

## Encryption Details

The MuleSoft tool uses the following format:

- **Algorithm**: AES-128-CBC or AES-256-CBC (based on key length)
- **IV (Initialization Vector)**: Derived from first 16 characters of the encryption key
- **Output Format**: `![base64EncodedString]`
- **Key Requirements**: Minimum 16 characters (32 characters recommended for AES-256)

### Example

**Plain Text**: `mySecretPassword123`

**Encrypted** (with DEV key): `![YWJjZGVmZ2hpamtsbW5vcA==]`

## Known Issues

None at this time. Please report issues on the [GitHub repository](https://github.com/framedparadox/mulesoft-util-vscode/issues).

## Release Notes

### 0.0.1

- Mulesoft AES Encrypt / Decrypt tool with MuleSoft compatibility
- KeyIdentifier preset keys (DEV, FIT, UAT, PROD)
- Activity bar integration
- Secure key visibility toggle with partial masking
- Copy to clipboard functionality

---

## For MuleSoft Developers

This extension is designed to streamline your MuleSoft development workflow by
providing quick access to encryption tools directly within VS Code. No need to
switch to external tools or web interfaces.

### Supported File Types

The encryption button automatically appears when editing:
- `.yaml` files
- `.properties` files

---

**Enjoy secure MuleSoft development!**
