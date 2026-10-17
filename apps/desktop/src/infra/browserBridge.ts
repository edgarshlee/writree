import type { DesktopBridge } from '../core/ports'
import type {
  DocumentSnapshot,
  ApplySyncDocumentRequest,
  FileNode,
  GitCommitRequest,
  GitCommitResult,
  GitSnapshot,
  SaveDocumentRequest,
  SaveDocumentResult,
  WorkspaceSnapshot,
} from '../core/types'
import { detectLineEnding, normalizeLineEndings, sanitizeImageName } from '../core/markdown'

const DEMO_ROOT = 'Writree Demo'
const STORAGE_PREFIX = 'writree.demo.'
const defaultDocuments: Record<string, string> = {
  'README.md': `---\ntitle: Writree\n---\n\n# Write naturally. Keep every version.\n\nWritree는 **로컬 파일을 원본으로 유지하는** Markdown 에디터입니다.\n\n- [x] Typora처럼 자연스러운 편집\n- [x] Markdown 소스 모드\n- [x] Git diff와 명시적인 커밋\n\n> 이 브라우저 화면은 Tauri 없이 실행되는 데모 어댑터입니다.\n\n## 시작하기\n\n왼쪽에서 문서를 선택하고 자유롭게 편집해 보세요.\n`,
  'docs/architecture.md': '# Architecture\n\nLocal files remain the source of truth.\n\n```text\nReact → Tauri commands → filesystem / git\n      → Spring API → PostgreSQL\n```\n',
  'notes/todo.md': '# Todo\n\n- [ ] Write documentation\n- [ ] Review the diff\n- [ ] Commit intentionally\n',
}

function getDocument(path: string) {
  return localStorage.getItem(`${STORAGE_PREFIX}${path}`) ?? defaultDocuments[path] ?? ''
}

function setDocument(path: string, value: string) {
  localStorage.setItem(`${STORAGE_PREFIX}${path}`, value)
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function nodesFromPaths(paths: string[]): FileNode[] {
  const root: FileNode[] = []
  for (const path of paths) {
    const parts = path.split('/')
    let cursor = root
    parts.forEach((part, index) => {
      const kind = index === parts.length - 1 ? 'file' : 'directory'
      let node = cursor.find((item) => item.name === part && item.kind === kind)
      if (!node) {
        node = { name: part, path: parts.slice(0, index + 1).join('/'), kind, children: kind === 'directory' ? [] : undefined }
        cursor.push(node)
      }
      if (node.children) cursor = node.children
    })
  }
  return root.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1))
}

export class BrowserBridge implements DesktopBridge {
  private readonly paths = new Set(Object.keys(defaultDocuments))

  async chooseWorkspace() {
    return this.openWorkspace(DEMO_ROOT)
  }

  async openWorkspace(rootPath: string): Promise<WorkspaceSnapshot> {
    return {
      rootPath,
      name: rootPath.split(/[\\/]/).pop() || DEMO_ROOT,
      files: nodesFromPaths([...this.paths]),
      gitRepository: true,
    }
  }

  async createDocument(_rootPath: string, relativePath: string): Promise<DocumentSnapshot> {
    const path = normalizeMarkdownPath(relativePath)
    if (this.paths.has(path)) throw new Error('같은 이름의 파일이 이미 있습니다.')
    const title = path.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || '새 문서'
    const markdown = `# ${title}\n\n`
    this.paths.add(path)
    setDocument(path, markdown)
    return {
      relativePath: path,
      markdown,
      contentHash: await hash(markdown),
      modifiedAt: Date.now(),
      lineEnding: 'lf',
    }
  }

  async renameDocument(_rootPath: string, relativePath: string, newRelativePath: string): Promise<DocumentSnapshot> {
    const path = normalizeMarkdownPath(newRelativePath)
    if (!this.paths.has(relativePath)) throw new Error('이름을 변경할 파일을 찾지 못했습니다.')
    if (path !== relativePath && this.paths.has(path)) throw new Error('같은 이름의 파일이 이미 있습니다.')
    const markdown = getDocument(relativePath)
    this.paths.delete(relativePath)
    this.paths.add(path)
    localStorage.removeItem(`${STORAGE_PREFIX}${relativePath}`)
    setDocument(path, markdown)
    return {
      relativePath: path,
      markdown,
      contentHash: await hash(markdown),
      modifiedAt: Date.now(),
      lineEnding: detectLineEnding(markdown),
    }
  }

  async readDocument(_rootPath: string, relativePath: string): Promise<DocumentSnapshot> {
    if (!this.paths.has(relativePath)) throw new Error('파일을 찾지 못했습니다.')
    const raw = getDocument(relativePath)
    const markdown = normalizeLineEndings(raw)
    return {
      relativePath,
      markdown,
      contentHash: await hash(raw),
      modifiedAt: Date.now(),
      lineEnding: detectLineEnding(raw),
    }
  }

  async saveDocument(request: SaveDocumentRequest): Promise<SaveDocumentResult> {
    const current = getDocument(request.relativePath)
    const currentHash = await hash(current)
    if (request.expectedHash && currentHash !== request.expectedHash) {
      throw new Error('FILE_CONFLICT: 파일이 다른 프로그램에서 변경되었습니다.')
    }
    setDocument(request.relativePath, request.markdown)
    return { contentHash: await hash(request.markdown), modifiedAt: Date.now() }
  }

  async saveImage(_rootPath: string, fileName: string, _bytes: number[]) {
    return `assets/${sanitizeImageName(fileName)}`
  }

  async readImage(_rootPath: string, relativePath: string) {
    return relativePath
  }

  async applySyncDocument(request: ApplySyncDocumentRequest): Promise<SaveDocumentResult | null> {
    const exists = this.paths.has(request.relativePath)
    if (exists) {
      const currentHash = await hash(getDocument(request.relativePath))
      if (!request.expectedFileHash || currentHash !== request.expectedFileHash) {
        throw new Error('SYNC_CONFLICT: 로컬 파일이 기준본과 다릅니다.')
      }
    } else if (request.expectedFileHash) {
      throw new Error('SYNC_CONFLICT: 기준 파일이 없습니다.')
    }
    if (request.deleted) {
      this.paths.delete(request.relativePath)
      localStorage.removeItem(`${STORAGE_PREFIX}${request.relativePath}`)
      return null
    }
    const markdown = request.markdown ?? ''
    this.paths.add(request.relativePath)
    setDocument(request.relativePath, markdown)
    return { contentHash: await hash(markdown), modifiedAt: Date.now() }
  }

  async writeConflictCopy(_rootPath: string, relativePath: string, markdown: string, deviceName: string) {
    const dot = relativePath.lastIndexOf('.')
    const stem = dot > -1 ? relativePath.slice(0, dot) : relativePath
    const extension = dot > -1 ? relativePath.slice(dot) : '.md'
    const suffix = deviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'remote'
    const path = `${stem}.conflict-${Date.now()}-${suffix}${extension}`
    this.paths.add(path)
    setDocument(path, markdown)
    return path
  }

  async gitStatus(_rootPath: string): Promise<GitSnapshot> {
    return {
      branch: 'main',
      upstream: 'origin/main',
      operation: 'normal',
      entries: [{ path: 'README.md', state: 'modified', staged: false }],
    }
  }

  async gitDiff(_rootPath: string, relativePath: string) {
    return `diff --git a/${relativePath} b/${relativePath}\n--- a/${relativePath}\n+++ b/${relativePath}\n@@ -1,3 +1,4 @@\n # Writree\n+Write naturally. Keep every version.\n`
  }

  async gitCommit(request: GitCommitRequest): Promise<GitCommitResult> {
    if (!request.paths.length) throw new Error('커밋할 파일을 선택하세요.')
    if (!request.message.trim()) throw new Error('커밋 메시지를 입력하세요.')
    return { commit: 'demo123', summary: `${request.paths.length} file(s) committed` }
  }

  async gitPush() {
    return 'Demo branch pushed to origin/main'
  }
}

function normalizeMarkdownPath(value: string) {
  let path = value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!path || path.startsWith('/') || path.split('/').some((part) => !part || part === '..' || part.startsWith('.'))) {
    throw new Error('워크스페이스 안의 올바른 파일 이름을 입력하세요.')
  }
  if (!/\.(md|markdown)$/i.test(path)) path += '.md'
  return path
}
