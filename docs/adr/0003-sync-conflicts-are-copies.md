# ADR 0003: Concurrent sync changes become conflict copies

- Status: Accepted
- Date: 2026-10-12

Last-write-wins would destroy intent, so every pushed change carries a base
revision. A mismatch is a conflict. The desktop keeps the local file and writes
the remote body beside it as `*.conflict-<date>-<device>.md`; remote deletions
never erase a locally changed document. Applied deletions are first moved into
`.writree-trash`.

The user resolves the documents with normal editor and Git tools. Sync never
creates a Git commit.
