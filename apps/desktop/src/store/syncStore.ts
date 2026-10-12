import { WritreeApi, type Conflict, type DocumentChange, type User } from '@writree/api-client'
import { invoke } from '@tauri-apps/api/core'
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { openUrl } from '@tauri-apps/plugin-opener'
import { create } from 'zustand'
import type { DocumentSnapshot, FileNode, SyncedDocumentState } from '../core/types'
import { bridge, isTauri } from '../infra/bridge'
import {
  disableSyncState,
  loadSyncedDocuments,
  loadSyncState,
  saveSyncedDocument,
  saveSyncState,
} from '../infra/metadata'
import { useWorkspaceStore } from './workspaceStore'

type SyncStatus = 'local' | 'connecting' | 'connected' | 'syncing' | 'error'

interface SyncState {
  apiUrl: string
  status: SyncStatus
  user: User | null
  remoteWorkspaceId: string | null
  enabled: boolean
  cursor: number | null
  conflicts: string[]
  lastSyncedAt: string | null
  message: string | null
  initialize(): Promise<void>
  loadWorkspaceState(): Promise<void>
  beginLogin(): Promise<void>
  connectWorkspace(): Promise<void>
  disconnectWorkspace(): Promise<void>
  syncNow(): Promise<void>
  logout(): Promise<void>
}

let accessToken: string | null = null
let accessTokenExpiresAt = 0
let deepLinkListenerReady = false

const configuredApiUrl = ((import.meta.env.VITE_WRITREE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
const deviceId = localStorage.getItem('writree.deviceId') ?? crypto.randomUUID()
localStorage.setItem('writree.deviceId', deviceId)

function api(baseUrl: string) {
  return new WritreeApi(baseUrl, () => accessToken)
}

async function storeRefreshToken(token: string) {
  if (isTauri) await invoke('store_refresh_token', { token })
  else localStorage.setItem('writree.demo.refreshToken', token)
}

async function loadRefreshToken() {
  if (isTauri) return invoke<string | null>('load_refresh_token')
  return localStorage.getItem('writree.demo.refreshToken')
}

async function deleteRefreshToken() {
  if (isTauri) await invoke('delete_refresh_token')
  else localStorage.removeItem('writree.demo.refreshToken')
}

function applyTokenPair(pair: { accessToken: string; refreshToken: string; expiresIn: number }) {
  accessToken = pair.accessToken
  accessTokenExpiresAt = Date.now() + pair.expiresIn * 1000
  return storeRefreshToken(pair.refreshToken)
}

async function requireAccessToken(baseUrl: string) {
  if (accessToken && accessTokenExpiresAt > Date.now() + 30_000) return accessToken
  const refreshToken = await loadRefreshToken()
  if (!refreshToken) throw new Error('GitHub 로그인이 필요합니다.')
  const pair = await api(baseUrl).refresh(refreshToken)
  await applyTokenPair(pair)
  return pair.accessToken
}

async function exchangeUrl(baseUrl: string, value: string) {
  const url = new URL(value)
  if (url.protocol !== 'writree:' || url.hostname !== 'auth' || url.pathname !== '/callback') return false
  const code = url.searchParams.get('code')
  if (!code) throw new Error('로그인 콜백에 일회용 코드가 없습니다.')
  const pair = await api(baseUrl).exchange(code, deviceId, 'Writree desktop')
  await applyTokenPair(pair)
  return true
}

function flattenMarkdown(nodes: FileNode[]): string[] {
  return nodes.flatMap((node) => node.kind === 'file'
    ? (/\.(md|markdown)$/i.test(node.path) ? [node.path] : [])
    : flattenMarkdown(node.children ?? []))
}

async function normalizedHash(markdown: string) {
  const bytes = new TextEncoder().encode(markdown.replace(/\r\n/g, '\n'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const emptyHashPromise = normalizedHash('')

function userMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function currentFiles(rootPath: string, nodes: FileNode[]) {
  const snapshots = new Map<string, { file: DocumentSnapshot; normalizedHash: string }>()
  for (const path of flattenMarkdown(nodes)) {
    const file = await bridge.readDocument(rootPath, path)
    snapshots.set(path, { file, normalizedHash: await normalizedHash(file.markdown) })
  }
  return snapshots
}

async function preserveConflict(rootPath: string, conflict: Conflict, label: string) {
  if (conflict.remoteDeleted || conflict.remoteContent == null) return null
  return bridge.writeConflictCopy(rootPath, conflict.relativePath, conflict.remoteContent, label)
}

export const useSyncStore = create<SyncState>((set, get) => ({
  apiUrl: configuredApiUrl,
  status: 'local',
  user: null,
  remoteWorkspaceId: null,
  enabled: false,
  cursor: null,
  conflicts: [],
  lastSyncedAt: null,
  message: null,

  async initialize() {
    const baseUrl = get().apiUrl
    if (!baseUrl) return
    if (isTauri && !deepLinkListenerReady) {
      deepLinkListenerReady = true
      await onOpenUrl(async (urls) => {
        for (const url of urls) {
          try {
            if (await exchangeUrl(baseUrl, url)) {
              set({ status: 'connected', user: await api(baseUrl).me(), message: 'GitHub 로그인이 완료되었습니다.' })
              await get().loadWorkspaceState()
              break
            }
          } catch (error) {
            set({ status: 'error', message: userMessage(error) })
          }
        }
      })
      const initialUrls = await getCurrent()
      for (const url of initialUrls ?? []) {
        if (await exchangeUrl(baseUrl, url)) break
      }
    }
    try {
      await requireAccessToken(baseUrl)
      set({ status: 'connected', user: await api(baseUrl).me() })
      await get().loadWorkspaceState()
    } catch {
      set({ status: 'local', user: null })
    }
  },

  async loadWorkspaceState() {
    const workspace = useWorkspaceStore.getState().workspace
    if (!workspace) {
      set({ remoteWorkspaceId: null, enabled: false, cursor: null })
      return
    }
    const state = await loadSyncState(workspace.rootPath)
    set({
      remoteWorkspaceId: state?.remoteWorkspaceId ?? null,
      enabled: state?.enabled ?? false,
      cursor: state?.cursor ?? null,
    })
  },

  async beginLogin() {
    const baseUrl = get().apiUrl
    if (!baseUrl) return
    set({ status: 'connecting', message: null })
    const url = `${baseUrl}/oauth2/authorization/github`
    if (isTauri) await openUrl(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  },

  async connectWorkspace() {
    const workspace = useWorkspaceStore.getState().workspace
    const baseUrl = get().apiUrl
    if (!workspace || !baseUrl) return
    try {
      set({ status: 'syncing', message: null })
      await requireAccessToken(baseUrl)
      let state = await loadSyncState(workspace.rootPath)
      if (!state) {
        const remote = await api(baseUrl).createWorkspace(workspace.name)
        state = { remoteWorkspaceId: remote.id, cursor: null, enabled: true }
      } else {
        state = { ...state, enabled: true }
      }
      await saveSyncState(workspace.rootPath, state)
      set({ remoteWorkspaceId: state.remoteWorkspaceId, cursor: state.cursor, enabled: true, status: 'connected' })
      await get().syncNow()
    } catch (error) {
      set({ status: 'error', message: userMessage(error) })
    }
  },

  async disconnectWorkspace() {
    const workspace = useWorkspaceStore.getState().workspace
    if (!workspace) return
    await disableSyncState(workspace.rootPath)
    set({ enabled: false, status: get().user ? 'connected' : 'local', message: '이 워크스페이스의 동기화를 해제했습니다.' })
  },

  async syncNow() {
    const workspaceState = useWorkspaceStore.getState()
    const workspace = workspaceState.workspace
    const baseUrl = get().apiUrl
    const remoteWorkspaceId = get().remoteWorkspaceId
    if (!workspace || !baseUrl || !remoteWorkspaceId || !get().enabled) return
    if (Object.values(workspaceState.documents).some((document) => document.saveState === 'dirty' || document.saveState === 'saving')) {
      set({ message: '저장 대기 중인 문서를 먼저 저장한 뒤 동기화하세요.' })
      return
    }

    try {
      set({ status: 'syncing', conflicts: [], message: null })
      await requireAccessToken(baseUrl)
      const metadata = await loadSyncedDocuments(workspace.rootPath)
      const bases = new Map(metadata.map((item) => [item.relativePath, item]))
      const files = await currentFiles(workspace.rootPath, workspace.files)
      const changes: DocumentChange[] = []
      for (const [path, local] of files) {
        const base = bases.get(path)
        if (!base || base.baseHash !== local.normalizedHash) {
          changes.push({
            relativePath: path,
            content: local.file.markdown,
            contentHash: local.normalizedHash,
            baseRevision: base?.baseRevision ?? null,
            deleted: false,
            clientUpdatedAt: new Date(local.file.modifiedAt).toISOString(),
          })
        }
      }
      const emptyHash = await emptyHashPromise
      for (const base of metadata) {
        if (!files.has(base.relativePath)) {
          changes.push({
            relativePath: base.relativePath,
            content: null,
            contentHash: emptyHash,
            baseRevision: base.baseRevision,
            deleted: true,
            clientUpdatedAt: new Date().toISOString(),
          })
        }
      }

      const result = await api(baseUrl).sync(remoteWorkspaceId, {
        deviceId,
        cursor: get().cursor,
        changes,
      })
      for (const accepted of result.accepted) {
        await saveSyncedDocument(workspace.rootPath, {
          relativePath: accepted.relativePath,
          baseRevision: accepted.revision,
          baseHash: accepted.contentHash,
        })
        bases.set(accepted.relativePath, {
          relativePath: accepted.relativePath,
          baseRevision: accepted.revision,
          baseHash: accepted.contentHash,
        })
      }

      const conflictPaths: string[] = []
      const reloadedPaths: string[] = []
      for (const remote of result.remoteChanges) {
        const local = files.get(remote.relativePath)
        const base = bases.get(remote.relativePath)
        const safeToApply = local
          ? Boolean(base && local.normalizedHash === base.baseHash)
          : !base || base.baseHash === emptyHash
        if (!safeToApply) {
          if (remote.content != null) {
            const copy = await bridge.writeConflictCopy(workspace.rootPath, remote.relativePath, remote.content, 'remote')
            conflictPaths.push(copy)
          } else {
            conflictPaths.push(`${remote.relativePath} (원격 삭제 충돌)`)
          }
          continue
        }
        await bridge.applySyncDocument({
          rootPath: workspace.rootPath,
          relativePath: remote.relativePath,
          markdown: remote.content ?? null,
          expectedFileHash: local?.file.contentHash ?? null,
          deleted: remote.deleted,
          lineEnding: local?.file.lineEnding ?? 'lf',
        })
        await saveSyncedDocument(workspace.rootPath, {
          relativePath: remote.relativePath,
          baseRevision: remote.baseRevision ?? 0,
          baseHash: remote.contentHash,
        })
        reloadedPaths.push(remote.relativePath)
      }

      for (const conflict of result.conflicts) {
        const copy = await preserveConflict(workspace.rootPath, conflict, 'remote')
        conflictPaths.push(copy ?? `${conflict.relativePath} (원격 삭제 충돌)`)
      }

      const nextState = { remoteWorkspaceId, cursor: result.cursor, enabled: true }
      await saveSyncState(workspace.rootPath, nextState)
      await useWorkspaceStore.getState().reloadFromDisk(reloadedPaths)
      const now = new Date().toISOString()
      set({
        cursor: result.cursor,
        conflicts: conflictPaths,
        lastSyncedAt: now,
        status: 'connected',
        message: conflictPaths.length
          ? `${conflictPaths.length}개의 충돌 복사본을 보존했습니다.`
          : '동기화를 완료했습니다.',
      })
    } catch (error) {
      set({ status: 'error', message: userMessage(error) })
    }
  },

  async logout() {
    const baseUrl = get().apiUrl
    const refreshToken = await loadRefreshToken()
    try {
      if (baseUrl && refreshToken) await api(baseUrl).logout(refreshToken)
    } finally {
      await deleteRefreshToken()
      accessToken = null
      accessTokenExpiresAt = 0
      set({ status: 'local', user: null, enabled: false, remoteWorkspaceId: null, cursor: null, message: '로그아웃했습니다.' })
    }
  },
}))
