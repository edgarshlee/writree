export type LineEnding = 'lf' | 'crlf'
export type EditorMode = 'wysiwyg' | 'source'
export type Theme = 'light' | 'dark'
export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'

export interface FileNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: FileNode[]
}

export interface WorkspaceSnapshot {
  rootPath: string
  name: string
  files: FileNode[]
  gitRepository: boolean
}

export interface DocumentSnapshot {
  relativePath: string
  markdown: string
  contentHash: string
  modifiedAt: number
  lineEnding: LineEnding
}

export interface OpenDocument extends DocumentSnapshot {
  title: string
  savedMarkdown: string
  saveState: SaveState
  lastError?: string
}

export interface SaveDocumentRequest {
  rootPath: string
  relativePath: string
  markdown: string
  expectedHash: string
  lineEnding: LineEnding
}

export interface SaveDocumentResult {
  contentHash: string
  modifiedAt: number
}

export interface ApplySyncDocumentRequest {
  rootPath: string
  relativePath: string
  markdown: string | null
  expectedFileHash: string | null
  deleted: boolean
  lineEnding?: LineEnding
}

export type GitFileState =
  | 'untracked'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'conflicted'

export interface GitStatusEntry {
  path: string
  state: GitFileState
  staged: boolean
}

export interface GitSnapshot {
  branch: string | null
  upstream: string | null
  operation: 'normal' | 'merge' | 'rebase' | 'cherry-pick'
  entries: GitStatusEntry[]
}

export interface GitCommitRequest {
  rootPath: string
  paths: string[]
  message: string
}

export interface GitCommitResult {
  commit: string
  summary: string
}

export interface OutlineItem {
  level: number
  text: string
  line: number
}

export interface SyncChange {
  relativePath: string
  content: string | null
  contentHash: string
  baseRevision: number | null
  deleted: boolean
  clientUpdatedAt: string
}

export interface SyncRequest {
  deviceId: string
  cursor: number | null
  changes: SyncChange[]
}

export interface Revision {
  id: string
  revision: number
  contentHash: string
  createdAt: string
}

export interface LocalSyncState {
  remoteWorkspaceId: string
  cursor: number | null
  enabled: boolean
}

export interface SyncedDocumentState {
  relativePath: string
  baseRevision: number
  baseHash: string
}
