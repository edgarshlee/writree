# ADR 0002: Git mutations require explicit user actions

- Status: Accepted
- Date: 2026-10-12

Writree may inspect status and diffs automatically, but staging, committing,
and pushing happen only after a user action. The Rust command boundary accepts
only workspace-relative Markdown files and images under `assets/`, passes a
`--` path separator to Git, and never exposes a general shell.

Merge, rebase, cherry-pick, detached HEAD, and missing-upstream states are
reported instead of being repaired automatically. Existing unrelated changes
remain untouched.
