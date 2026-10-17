import Database from '@tauri-apps/plugin-sql'
import { isTauri } from './bridge'
import type { LocalSyncState, SyncedDocumentState } from '../core/types'

let databasePromise: Promise<Database> | null = null
const recentWorkspaceKey = 'writree.recentWorkspace'

function database() {
  databasePromise ??= Database.load('sqlite:writree.db')
  return databasePromise
}

export async function rememberWorkspace(rootPath: string, name: string) {
  localStorage.setItem(recentWorkspaceKey, JSON.stringify({ rootPath, name }))
  if (!isTauri) return
  const db = await database()
  await db.execute(
    `INSERT INTO recent_workspaces(path, name, opened_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(path) DO UPDATE SET name = excluded.name, opened_at = CURRENT_TIMESTAMP`,
    [rootPath, name],
  )
}

export async function loadRecentWorkspace(): Promise<{ rootPath: string; name: string } | null> {
  const stored = localStorage.getItem(recentWorkspaceKey)
  if (stored) {
    try {
      return JSON.parse(stored) as { rootPath: string; name: string }
    } catch {
      localStorage.removeItem(recentWorkspaceKey)
    }
  }
  if (!isTauri) return null
  const db = await database()
  const rows = await db.select<Array<{ rootPath: string; name: string }>>(
    `SELECT path AS rootPath, name
     FROM recent_workspaces
     ORDER BY opened_at DESC
     LIMIT 1`,
  )
  const recent = rows[0] ?? null
  if (recent) localStorage.setItem(recentWorkspaceKey, JSON.stringify(recent))
  return recent
}

export async function saveRecovery(rootPath: string, relativePath: string, markdown: string) {
  if (!isTauri) {
    localStorage.setItem(`writree.recovery.${rootPath}.${relativePath}`, markdown)
    return
  }
  const db = await database()
  await db.execute(
    `INSERT INTO recovery_snapshots(workspace_path, relative_path, markdown, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT(workspace_path, relative_path)
     DO UPDATE SET markdown = excluded.markdown, updated_at = CURRENT_TIMESTAMP`,
    [rootPath, relativePath, markdown],
  )
}

export async function clearRecovery(rootPath: string, relativePath: string) {
  if (!isTauri) {
    localStorage.removeItem(`writree.recovery.${rootPath}.${relativePath}`)
    return
  }
  const db = await database()
  await db.execute(
    'DELETE FROM recovery_snapshots WHERE workspace_path = $1 AND relative_path = $2',
    [rootPath, relativePath],
  )
}

export async function loadRecovery(rootPath: string, relativePath: string): Promise<string | null> {
  if (!isTauri) return localStorage.getItem(`writree.recovery.${rootPath}.${relativePath}`)
  const db = await database()
  const rows = await db.select<Array<{ markdown: string }>>(
    'SELECT markdown FROM recovery_snapshots WHERE workspace_path = $1 AND relative_path = $2',
    [rootPath, relativePath],
  )
  return rows[0]?.markdown ?? null
}

const syncStateKey = (rootPath: string) => `writree.sync.state.${rootPath}`
const syncDocumentsKey = (rootPath: string) => `writree.sync.documents.${rootPath}`

export async function loadSyncState(rootPath: string): Promise<LocalSyncState | null> {
  if (!isTauri) {
    const stored = localStorage.getItem(syncStateKey(rootPath))
    return stored ? JSON.parse(stored) as LocalSyncState : null
  }
  const db = await database()
  const rows = await db.select<Array<{ remoteWorkspaceId: string; cursor: number | null; enabled: number }>>(
    `SELECT remote_workspace_id AS remoteWorkspaceId, cursor, enabled
     FROM sync_state WHERE workspace_path = $1`,
    [rootPath],
  )
  const row = rows[0]
  return row ? { remoteWorkspaceId: row.remoteWorkspaceId, cursor: row.cursor, enabled: Boolean(row.enabled) } : null
}

export async function saveSyncState(rootPath: string, state: LocalSyncState) {
  if (!isTauri) {
    localStorage.setItem(syncStateKey(rootPath), JSON.stringify(state))
    return
  }
  const db = await database()
  await db.execute(
    `INSERT INTO sync_state(workspace_path, remote_workspace_id, cursor, enabled, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT(workspace_path) DO UPDATE SET
       remote_workspace_id = excluded.remote_workspace_id,
       cursor = excluded.cursor,
       enabled = excluded.enabled,
       updated_at = CURRENT_TIMESTAMP`,
    [rootPath, state.remoteWorkspaceId, state.cursor, state.enabled ? 1 : 0],
  )
}

export async function disableSyncState(rootPath: string) {
  const state = await loadSyncState(rootPath)
  if (!state) return
  await saveSyncState(rootPath, { ...state, enabled: false })
}

export async function loadSyncedDocuments(rootPath: string): Promise<SyncedDocumentState[]> {
  if (!isTauri) {
    const stored = localStorage.getItem(syncDocumentsKey(rootPath))
    return stored ? JSON.parse(stored) as SyncedDocumentState[] : []
  }
  const db = await database()
  return db.select<SyncedDocumentState[]>(
    `SELECT relative_path AS relativePath, base_revision AS baseRevision, base_hash AS baseHash
     FROM sync_documents WHERE workspace_path = $1`,
    [rootPath],
  )
}

export async function saveSyncedDocument(rootPath: string, state: SyncedDocumentState) {
  if (!isTauri) {
    const states = await loadSyncedDocuments(rootPath)
    const next = [...states.filter((item) => item.relativePath !== state.relativePath), state]
    localStorage.setItem(syncDocumentsKey(rootPath), JSON.stringify(next))
    return
  }
  const db = await database()
  await db.execute(
    `INSERT INTO sync_documents(workspace_path, relative_path, base_revision, base_hash, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT(workspace_path, relative_path) DO UPDATE SET
       base_revision = excluded.base_revision,
       base_hash = excluded.base_hash,
       updated_at = CURRENT_TIMESTAMP`,
    [rootPath, state.relativePath, state.baseRevision, state.baseHash],
  )
}
