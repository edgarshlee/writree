# Windows release checklist

1. Run `pnpm check`, `cargo test`, and `apps/server/mvnw.cmd verify`.
2. Run the Playwright suite and the two-device sync scenario.
3. Build the NSIS installer with `pnpm tauri build` on Windows 11 x64.
4. Install on a clean VM; open, edit, recover, commit, and push a test repo.
5. Publish the unsigned installer and its SHA-256 checksum.
6. State clearly that SmartScreen may warn because v1 does not include code signing.
