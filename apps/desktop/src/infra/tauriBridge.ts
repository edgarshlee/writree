import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { DesktopBridge } from '../core/ports'
import type {
  DocumentSnapshot,
  ApplySyncDocumentRequest,
  GitCommitRequest,
  GitCommitResult,
  GitSnapshot,
  SaveDocumentRequest,
  SaveDocumentResult,
  WorkspaceSnapshot,
} from '../core/types'

export class TauriBridge implements DesktopBridge {
  async chooseWorkspace(): Promise<WorkspaceSnapshot | null> {
    const selected = await open({ directory: true, multiple: false, title: 'Writree 워크스페이스 열기' })
    if (!selected) return null
    return this.openWorkspace(selected)
  }

  openWorkspace(rootPath: string) {
    return invoke<WorkspaceSnapshot>('open_workspace', { rootPath })
  }

  readDocument(rootPath: string, relativePath: string) {
    return invoke<DocumentSnapshot>('read_document', { rootPath, relativePath })
  }

  saveDocument(request: SaveDocumentRequest) {
    return invoke<SaveDocumentResult>('save_document', { request })
  }

  saveImage(rootPath: string, fileName: string, bytes: number[]) {
    return invoke<string>('save_image', { rootPath, fileName, bytes })
  }

  readImage(rootPath: string, relativePath: string) {
    return invoke<string>('read_workspace_image', { rootPath, relativePath })
  }

  applySyncDocument(request: ApplySyncDocumentRequest) {
    return invoke<SaveDocumentResult | null>('apply_sync_document', { request })
  }

  writeConflictCopy(rootPath: string, relativePath: string, markdown: string, deviceName: string) {
    return invoke<string>('write_conflict_copy', { rootPath, relativePath, markdown, deviceName })
  }

  gitStatus(rootPath: string) {
    return invoke<GitSnapshot>('git_status', { rootPath })
  }

  gitDiff(rootPath: string, relativePath: string) {
    return invoke<string>('git_diff', { rootPath, relativePath })
  }

  gitCommit(request: GitCommitRequest) {
    return invoke<GitCommitResult>('git_commit', { request })
  }

  gitPush(rootPath: string) {
    return invoke<string>('git_push', { rootPath })
  }
}
