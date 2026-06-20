# Change Log

All notable changes to the "v1" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Removed the MuleSoft AES Encrypt / Decrypt tool and its KeyIdentifier settings surfaces.
- Refactored project structure:
  - moved panel implementations under `src/panels/`
  - moved sidebar provider under `src/providers/`
  - added barrel exports in `src/panels/index.ts` and `src/providers/index.ts`
