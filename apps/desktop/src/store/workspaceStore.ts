import { create } from 'zustand'
import { bridge } from '../infra/bridge'
import { clearRecovery, loadRecentWorkspace, loadRecovery, rememberWorkspace } from '../infra/metadata'
import type {
  EditorMode,
  GitSnapshot,
  OpenDocument,
  Theme,
  WorkspaceSnapshot,
} from '../core/types'
import { requiresSourceMode } from '../core/markdown'

interface WorkspaceState {
  workspace: WorkspaceSnapshot | null
  documents: Record<string, OpenDocument>
  tabs: string[]
  activePath: string | null
  mode: EditorMode
  theme: Theme
  loading: boolean
  message: string | null
  git: GitSnapshot | null
  gitDiff: string
  selectedGitPaths: string[]
  commitMessage: string
  openDemo(): Promise<void>
  restoreRecentWorkspace(): Promise<void>
  chooseWorkspace(): Promise<void>
  createDocument(): Promise<void>
  renameDocument(path: string): Promise<void>
  openDocument(path: string): Promise<void>
  closeDocument(path: string): void
  setActive(path: string): void
  updateMarkdown(markdown: string): void
  setDocumentError(message: string): void
  saveActive(): Promise<void>
  preserveActiveAsCopy(): Promise<void>
  reloadActiveFromDisk(): Promise<void>
  reloadFromDisk(paths: string[]): Promise<void>
  setMode(mode: EditorMode): void
  toggleTheme(): void
  refreshGit(): Promise<void>
  toggleGitPath(path: string): void
  loadDiff(path: string): Promise<void>
  setCommitMessage(message: string): void
  commitSelected(): Promise<void>
  push(): Promise<void>
  dismissMessage(): void
}

function titleFromPath(path: string) {
  return path.split('/').pop() ?? path
}

function userMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function hydrateWorkspace(snapshot: WorkspaceSnapshot, set: (partial: Partial<WorkspaceState>) => void) {
  set({
    workspace: snapshot,
    documents: {},
    tabs: [],
    activePath: null,
    git: null,
    gitDiff: '',
    selectedGitPaths: [],
    message: `${snapshot.name} 워크스페이스를 열었습니다.`,
  })
  // The tree should become usable immediately. Persisting recent-workspace
  // metadata is non-critical and can finish after the first paint.
  void rememberWorkspace(snapshot.rootPath, snapshot.name).catch((error) => console.warn('최근 워크스페이스 저장 실패', error))
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  documents: {},
  tabs: [],
  activePath: null,
  mode: 'wysiwyg',
  theme: (localStorage.getItem('writree.theme') as Theme) || 'light',
  loading: false,
  message: null,
  git: null,
  gitDiff: '',
  selectedGitPaths: [],
  commitMessage: '',

  async openDemo() {
    if (get().workspace || get().loading) return
    set({ loading: true })
    try {
      const snapshot = await bridge.openWorkspace('Writree Demo')
      hydrateWorkspace(snapshot, set)
      set({ loading: false })
      const first = findFirstMarkdown(snapshot.files)
      if (first) await get().openDocument(first)
      void get().refreshGit()
    } catch (error) {
      set({ message: userMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  async restoreRecentWorkspace() {
    if (get().workspace || get().loading) return
    set({ loading: true })
    try {
      const recent = await loadRecentWorkspace()
      if (!recent) return
      const snapshot = await bridge.openWorkspace(recent.rootPath)
      hydrateWorkspace(snapshot, set)
      set({ loading: false })
      const first = findFirstMarkdown(snapshot.files)
      if (first) await get().openDocument(first)
      void get().refreshGit()
    } catch (error) {
      set({ message: `최근 워크스페이스를 다시 열지 못했습니다: ${userMessage(error)}` })
    } finally {
      set({ loading: false })
    }
  },

  async chooseWorkspace() {
    set({ loading: true })
    try {
      const snapshot = await bridge.chooseWorkspace()
      if (!snapshot) return
      hydrateWorkspace(snapshot, set)
      set({ loading: false })
      const first = findFirstMarkdown(snapshot.files)
      if (first) await get().openDocument(first)
      void get().refreshGit()
    } catch (error) {
      set({ message: userMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  async createDocument() {
    const state = get()
    if (!state.workspace) {
      set({ message: '먼저 워크스페이스 폴더를 열어주세요.' })
      return
    }
    const input = window.prompt('새 Markdown 파일 이름 또는 상대 경로를 입력하세요.', '새 문서.md')
    if (input === null) return
    const relativePath = input.trim()
    if (!relativePath) {
      set({ message: '파일 이름을 입력하세요.' })
      return
    }
    set({ loading: true })
    try {
      const created = await bridge.createDocument(state.workspace.rootPath, relativePath)
      const workspace = await bridge.openWorkspace(state.workspace.rootPath)
      const path = created.relativePath
      const document: OpenDocument = {
        ...created,
        title: titleFromPath(path),
        savedMarkdown: created.markdown,
        saveState: 'saved',
      }
      set((current) => ({
        workspace,
        documents: { ...current.documents, [path]: document },
        tabs: current.tabs.includes(path) ? current.tabs : [...current.tabs, path],
        activePath: path,
        mode: 'wysiwyg',
        message: `${path} 파일을 만들었습니다.`,
      }))
      await get().refreshGit()
    } catch (error) {
      set({ message: userMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  async renameDocument(path) {
    const state = get()
    if (!state.workspace) return
    const opened = state.documents[path]
    if (opened && opened.saveState !== 'saved') {
      set({ message: '문서 저장이 완료된 후 이름을 변경해 주세요.' })
      return
    }
    const currentName = titleFromPath(path)
    const input = window.prompt('새 Markdown 파일 이름을 입력하세요.', currentName)
    if (input === null) return
    const newName = input.trim()
    if (!newName) {
      set({ message: '파일 이름을 입력하세요.' })
      return
    }
    if (/[\\/]/.test(newName)) {
      set({ message: '파일 이름에는 슬래시를 사용할 수 없습니다.' })
      return
    }
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
    const requestedPath = `${parent}${newName}`
    set({ loading: true })
    try {
      const renamed = await bridge.renameDocument(state.workspace.rootPath, path, requestedPath)
      const nextPath = renamed.relativePath
      const workspace = await bridge.openWorkspace(state.workspace.rootPath)
      await clearRecovery(state.workspace.rootPath, path)
      set((current) => {
        const documents = { ...current.documents }
        const previous = documents[path]
        delete documents[path]
        if (previous) {
          documents[nextPath] = {
            ...renamed,
            title: titleFromPath(nextPath),
            savedMarkdown: renamed.markdown,
            saveState: 'saved',
          }
        }
        return {
          workspace,
          documents,
          tabs: current.tabs.map((tab) => tab === path ? nextPath : tab),
          activePath: current.activePath === path ? nextPath : current.activePath,
          selectedGitPaths: current.selectedGitPaths.filter((selected) => selected !== path),
          gitDiff: '',
          message: `${path}의 이름을 ${nextPath}(으)로 변경했습니다.`,
        }
      })
      await get().refreshGit()
    } catch (error) {
      set({ message: userMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  async openDocument(path) {
    const state = get()
    if (!state.workspace) return
    if (state.documents[path]) {
      set({ activePath: path })
      return
    }
    try {
      const snapshot = await bridge.readDocument(state.workspace.rootPath, path)
      const recovery = await loadRecovery(state.workspace.rootPath, path)
      const markdown = recovery ?? snapshot.markdown
      const document: OpenDocument = {
        ...snapshot,
        title: titleFromPath(path),
        markdown,
        savedMarkdown: snapshot.markdown,
        saveState: recovery && recovery !== snapshot.markdown ? 'dirty' : 'saved',
      }
      set((current) => ({
        documents: { ...current.documents, [path]: document },
        tabs: [...current.tabs, path],
        activePath: path,
        message: recovery && recovery !== snapshot.markdown ? '복구 중이던 내용을 불러왔습니다.' : current.message,
        mode: requiresSourceMode(markdown) ? 'source' : current.mode,
      }))
    } catch (error) {
      set({ message: userMessage(error) })
    }
  },

  closeDocument(path) {
    const state = get()
    const document = state.documents[path]
    if (document?.saveState === 'dirty' && !window.confirm(`${document.title}의 변경 사항이 저장되지 않았습니다. 닫을까요?`)) return
    const documents = { ...state.documents }
    delete documents[path]
    const tabs = state.tabs.filter((tab) => tab !== path)
    const index = state.tabs.indexOf(path)
    const activePath = state.activePath === path ? tabs[Math.max(0, index - 1)] ?? null : state.activePath
    set({ documents, tabs, activePath })
  },

  setActive(path) {
    if (get().documents[path]) set({ activePath: path })
  },

  updateMarkdown(markdown) {
    const { activePath } = get()
    if (!activePath) return
    set((state) => {
      const current = state.documents[activePath]
      if (!current || current.markdown === markdown) return state
      return {
        documents: {
          ...state.documents,
          [activePath]: {
            ...current,
            markdown,
            saveState: markdown === current.savedMarkdown ? 'saved' : 'dirty',
            lastError: undefined,
          },
        },
      }
    })
  },

  setDocumentError(message) {
    const { activePath } = get()
    if (!activePath) return
    set((state) => ({
      documents: {
        ...state.documents,
        [activePath]: { ...state.documents[activePath], saveState: 'error', lastError: message },
      },
      message,
    }))
  },

  async saveActive() {
    const state = get()
    const path = state.activePath
    if (!path || !state.workspace) return
    const document = state.documents[path]
    if (!document || document.saveState === 'saved' || document.saveState === 'saving') return
    set((current) => ({
      documents: { ...current.documents, [path]: { ...current.documents[path], saveState: 'saving' } },
    }))
    try {
      const result = await bridge.saveDocument({
        rootPath: state.workspace.rootPath,
        relativePath: path,
        markdown: document.markdown,
        expectedHash: document.contentHash,
        lineEnding: document.lineEnding,
      })
      await clearRecovery(state.workspace.rootPath, path)
      set((current) => ({
        documents: {
          ...current.documents,
          [path]: {
            ...current.documents[path],
            savedMarkdown: current.documents[path].markdown,
            contentHash: result.contentHash,
            modifiedAt: result.modifiedAt,
            saveState: 'saved',
          },
        },
      }))
      void get().refreshGit()
    } catch (error) {
      const message = userMessage(error)
      const conflict = message.includes('FILE_CONFLICT')
      set((current) => ({
        documents: {
          ...current.documents,
          [path]: { ...current.documents[path], saveState: conflict ? 'conflict' : 'error', lastError: message },
        },
        message,
      }))
    }
  },

  async preserveActiveAsCopy() {
    const state = get()
    const path = state.activePath
    if (!state.workspace || !path) return
    const document = state.documents[path]
    if (!document) return
    try {
      const copyPath = await bridge.writeConflictCopy(
        state.workspace.rootPath,
        path,
        document.markdown,
        'local-edit',
      )
      const [workspace, original, copy] = await Promise.all([
        bridge.openWorkspace(state.workspace.rootPath),
        bridge.readDocument(state.workspace.rootPath, path),
        bridge.readDocument(state.workspace.rootPath, copyPath),
      ])
      await clearRecovery(state.workspace.rootPath, path)
      set((current) => ({
        workspace,
        documents: {
          ...current.documents,
          [path]: { ...original, title: titleFromPath(path), savedMarkdown: original.markdown, saveState: 'saved' },
          [copyPath]: { ...copy, title: titleFromPath(copyPath), savedMarkdown: copy.markdown, saveState: 'saved' },
        },
        tabs: current.tabs.includes(copyPath) ? current.tabs : [...current.tabs, copyPath],
        activePath: copyPath,
        message: `로컬 변경을 ${copyPath}에 보존했습니다.`,
      }))
      await get().refreshGit()
    } catch (error) {
      set({ message: userMessage(error) })
    }
  },

  async reloadActiveFromDisk() {
    const state = get()
    const path = state.activePath
    if (!state.workspace || !path) return
    if (!window.confirm('편집 중인 내용을 버리고 디스크의 최신 파일을 불러올까요?')) return
    try {
      const snapshot = await bridge.readDocument(state.workspace.rootPath, path)
      await clearRecovery(state.workspace.rootPath, path)
      set((current) => ({
        documents: {
          ...current.documents,
          [path]: { ...snapshot, title: titleFromPath(path), savedMarkdown: snapshot.markdown, saveState: 'saved' },
        },
        message: '디스크의 최신 파일을 다시 불러왔습니다.',
      }))
    } catch (error) {
      set({ message: userMessage(error) })
    }
  },

  async reloadFromDisk(paths) {
    const state = get()
    if (!state.workspace) return
    const snapshot = await bridge.openWorkspace(state.workspace.rootPath)
    const documents = { ...get().documents }
    let tabs = [...get().tabs]
    let activePath = get().activePath
    for (const path of paths) {
      const current = documents[path]
      if (!current || current.saveState !== 'saved') continue
      try {
        const next = await bridge.readDocument(snapshot.rootPath, path)
        documents[path] = {
          ...next,
          title: current.title,
          savedMarkdown: next.markdown,
          saveState: 'saved',
        }
      } catch {
        delete documents[path]
        tabs = tabs.filter((tab) => tab !== path)
        if (activePath === path) activePath = tabs.at(-1) ?? null
      }
    }
    set({ workspace: snapshot, documents, tabs, activePath })
    await get().refreshGit()
  },

  setMode(mode) {
    if (mode === 'wysiwyg') {
      const state = get()
      const document = state.activePath ? state.documents[state.activePath] : undefined
      if (document && requiresSourceMode(document.markdown)) {
        set({ mode: 'source', message: 'HTML 또는 지원하지 않는 확장은 원문 보존을 위해 소스 모드에서 편집합니다.' })
        return
      }
    }
    set({ mode })
  },

  toggleTheme() {
    const theme = get().theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('writree.theme', theme)
    set({ theme })
  },

  async refreshGit() {
    const workspace = get().workspace
    if (!workspace?.gitRepository) {
      set({ git: null })
      return
    }
    try {
      set({ git: await bridge.gitStatus(workspace.rootPath) })
    } catch (error) {
      set({ message: userMessage(error) })
    }
  },

  toggleGitPath(path) {
    const selected = get().selectedGitPaths
    set({ selectedGitPaths: selected.includes(path) ? selected.filter((item) => item !== path) : [...selected, path] })
  },

  async loadDiff(path) {
    const workspace = get().workspace
    if (!workspace) return
    try {
      set({ gitDiff: await bridge.gitDiff(workspace.rootPath, path) })
    } catch (error) {
      set({ message: userMessage(error) })
    }
  },

  setCommitMessage(commitMessage) {
    set({ commitMessage })
  },

  async commitSelected() {
    const state = get()
    if (!state.workspace) return
    try {
      const result = await bridge.gitCommit({
        rootPath: state.workspace.rootPath,
        paths: state.selectedGitPaths,
        message: state.commitMessage,
      })
      set({ message: `${result.commit.slice(0, 7)} ${result.summary}`, commitMessage: '', selectedGitPaths: [], gitDiff: '' })
      await get().refreshGit()
    } catch (error) {
      set({ message: userMessage(error) })
    }
  },

  async push() {
    const workspace = get().workspace
    if (!workspace) return
    try {
      set({ message: await bridge.gitPush(workspace.rootPath) })
    } catch (error) {
      set({ message: userMessage(error) })
    }
  },

  dismissMessage() {
    set({ message: null })
  },
}))

function findFirstMarkdown(nodes: WorkspaceSnapshot['files']): string | null {
  for (const node of nodes) {
    if (node.kind === 'file' && /\.md$/i.test(node.path)) return node.path
    if (node.children) {
      const nested = findFirstMarkdown(node.children)
      if (nested) return nested
    }
  }
  return null
}
