# Change Log

All notable changes to the "v1" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Renamed AES tool to `Mulesoft AES Encrypt / Decrypt` across command and UI labels.
- Replaced AES `Environment` terminology with `KeyIdentifier` across UI, storage model, and documentation.
- Refactored project structure:
  - moved panel implementations under `src/panels/`
  - moved sidebar provider under `src/providers/`
  - renamed AES panel file to `src/panels/security/mulesoftAesEncryptDecryptPanel.ts`
  - added barrel exports in `src/panels/index.ts` and `src/providers/index.ts`
