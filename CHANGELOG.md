# Change Log

All notable changes to the "v1" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Stripped the extension down to the **Mulesoft AES Encrypt / Decrypt** tool only.
  - Removed the generic AES, Base64, JWT, UUID, Format Text, Data Formatter,
    Certificate, Certificate Expiry, Data Visualizer, and Data Converter tools.
  - Simplified the Settings page to only AES KeyIdentifier settings and the
    compact display mode.
  - Removed now-unused dependencies (monaco-editor, react, d3, js-yaml,
    papaparse, fast-xml-parser) and related webpack loaders.
- Replaced all logos/icons with high-quality Font Awesome Free 6 based artwork
  (lock for AES, gear for settings, shield for the activity bar) and a new
  256×256 marketplace icon. Removed the old `electric`/`aes` PNGs.
- Renamed AES tool to `Mulesoft AES Encrypt / Decrypt` across command and UI labels.
- Replaced AES `Environment` terminology with `KeyIdentifier` across UI, storage model, and documentation.
- Refactored project structure:
  - moved panel implementations under `src/panels/`
  - moved sidebar provider under `src/providers/`
  - renamed AES panel file to `src/panels/security/mulesoftAesEncryptDecryptPanel.ts`
  - added barrel exports in `src/panels/index.ts` and `src/providers/index.ts`
