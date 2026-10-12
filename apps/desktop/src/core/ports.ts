import type { SyncRequest, SyncResult } from '@writree/api-client'
import type {
  DocumentSnapshot,
  ApplySyncDocumentRequest,
  GitCommitRequest,
  GitCommitResult,
  GitSnapshot,
  SaveDocumentRequest,
  SaveDocumentResult,
  WorkspaceSnapshot,
} from './types'

export interface FilePort {
  chooseWorkspace(): Promise<WorkspaceSnapshot | null>
  openWorkspace(rootPath: string): Promise<WorkspaceSnapshot>
  readDocument(rootPath: string, relativePath: string): Promise<DocumentSnapshot>
  saveDocument(request: SaveDocumentRequest): Promise<SaveDocumentResult>
  saveImage(rootPath: string, fileName: string, bytes: number[]): Promise<string>
  readImage(rootPath: string, relativePath: string): Promise<string>
  applySyncDocument(request: ApplySyncDocumentRequest): Promise<SaveDocumentResult | null>
  writeConflictCopy(rootPath: string, relativePath: string, markdown: string, deviceName: string): Promise<string>
}

export interface GitPort {
  gitStatus(rootPath: string): Promise<GitSnapshot>
  gitDiff(rootPath: string, relativePath: string): Promise<string>
  gitCommit(request: GitCommitRequest): Promise<GitCommitResult>
  gitPush(rootPath: string): Promise<string>
}

export interface AuthPort {
  beginLogin(): Promise<void>
  exchangeLoginCode(code: string): Promise<void>
  logout(): Promise<void>
}

export interface SyncPort {
  syncWorkspace(workspaceId: string, request: SyncRequest): Promise<SyncResult>
}

export type DesktopBridge = FilePort & GitPort
