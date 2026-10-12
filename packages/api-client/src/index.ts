import type { components } from './schema'

export type ApiErrorBody = components['schemas']['ApiError']
export type TokenPair = components['schemas']['TokenPair']
export type User = components['schemas']['User']
export type Workspace = components['schemas']['Workspace']
export type DocumentChange = components['schemas']['DocumentChange']
export type Revision = components['schemas']['Revision']
export type Conflict = components['schemas']['Conflict']
export type SyncRequest = components['schemas']['SyncRequest']
export type SyncResult = components['schemas']['SyncResult']
export type RevisionDetail = components['schemas']['RevisionDetail']

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
  }
}

export class WritreeApi {
  constructor(private readonly baseUrl: string, private readonly accessToken: () => string | null = () => null) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  exchange(code: string, deviceId: string, deviceName: string) {
    return this.request<TokenPair>('/api/v1/auth/exchange', { method: 'POST', body: JSON.stringify({ code, deviceId, deviceName }) }, false)
  }

  refresh(refreshToken: string) {
    return this.request<TokenPair>('/api/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false)
  }

  logout(refreshToken: string) {
    return this.request<void>('/api/v1/auth/session', { method: 'DELETE', body: JSON.stringify({ refreshToken }) }, false)
  }

  me() { return this.request<User>('/api/v1/me') }
  listWorkspaces() { return this.request<Workspace[]>('/api/v1/workspaces') }
  createWorkspace(name: string) { return this.request<Workspace>('/api/v1/workspaces', { method: 'POST', body: JSON.stringify({ name }) }) }
  deleteWorkspace(id: string) { return this.request<void>(`/api/v1/workspaces/${id}`, { method: 'DELETE' }) }
  sync(id: string, request: SyncRequest) { return this.request<SyncResult>(`/api/v1/workspaces/${id}/sync`, { method: 'POST', body: JSON.stringify(request) }) }
  revisions(documentId: string) { return this.request<RevisionDetail[]>(`/api/v1/documents/${documentId}/revisions`) }
  restore(documentId: string, revisionId: string) { return this.request<Revision>(`/api/v1/documents/${documentId}/revisions/${revisionId}/restore`, { method: 'POST' }) }

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')
    const token = this.accessToken()
    if (authenticated && token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    if (!response.ok) {
      const fallback: ApiErrorBody = { code: 'HTTP_ERROR', message: `HTTP ${response.status}`, traceId: '', fieldErrors: [] }
      let body = fallback
      try { body = await response.json() as ApiErrorBody } catch { /* keep fallback */ }
      throw new ApiError(response.status, body)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}
