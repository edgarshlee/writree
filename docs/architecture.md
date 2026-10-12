# Architecture

```mermaid
flowchart LR
  MD["Markdown files\nsource of truth"] <--> TAURI["Tauri 2\nrestricted Rust commands"]
  TAURI <--> UI["React + Milkdown\nCodeMirror 6"]
  TAURI --> GIT["System Git\nlocal credentials"]
  UI --> SQLITE["SQLite\nrecovery + cursors only"]
  UI -. explicit opt-in .-> API["Spring Boot API"]
  API --> PG["PostgreSQL\nrevisions + tombstones"]
```

The browser-facing code depends on `FilePort`, `GitPort`, `AuthPort`, and
`SyncPort` boundaries. Browser development uses a memory/localStorage adapter;
the installed app uses narrowly scoped Tauri commands. No arbitrary shell
command is exposed to the webview.

The OpenAPI contract in [`openapi.yaml`](openapi.yaml) is the source for the
shared API types. Local absolute paths never cross the sync boundary.
