# ADR 0001: Local Markdown files are authoritative

- Status: Accepted
- Date: 2026-10-12

Writree stores document content only in ordinary `.md`/`.markdown` files.
SQLite is limited to recent workspaces, recovery snapshots, and sync bases.
This keeps documents readable without Writree and makes backup, search, and
Git history independent from the app.

Atomic replacement and an expected-content hash prevent silent overwrites. A
remote change is applied only when the local file still matches the last sync
base.
