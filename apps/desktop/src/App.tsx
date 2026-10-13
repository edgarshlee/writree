import { Cloud, Code2, FilePlus2, FolderOpen, GitBranch, ListTree, Moon, Search, Sun, TextCursorInput } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Brand } from './components/Brand'
import { EditorPane } from './components/EditorPane'
import { FileTree } from './components/FileTree'
import { GitPanel } from './components/GitPanel'
import { OutlinePanel } from './components/OutlinePanel'
import { SearchBar } from './components/SearchBar'
import { SyncPanel } from './components/SyncPanel'
import { TabBar } from './components/TabBar'
import { documentStats } from './core/markdown'
import { isTauri } from './infra/bridge'
import { useAutosave } from './hooks/useAutosave'
import { useWorkspaceStore } from './store/workspaceStore'
import { useSyncStore } from './store/syncStore'

type RightPanel = 'outline' | 'git' | 'sync'

export default function App() {
  const [rightPanel, setRightPanel] = useState<RightPanel>('outline')
  const [searchOpen, setSearchOpen] = useState(false)
  const state = useWorkspaceStore()
  const sync = useSyncStore()
  const document = state.activePath ? state.documents[state.activePath] : undefined
  const stats = useMemo(() => documentStats(document?.markdown ?? ''), [document?.markdown])
  useAutosave()

  useEffect(() => {
    if (!isTauri) void state.openDemo()
    void sync.initialize()
  }, [])

  useEffect(() => {
    void sync.loadWorkspaceState()
  }, [state.workspace?.rootPath])

  useEffect(() => {
    document?.title && (window.document.title = `${document.saveState === 'dirty' ? '● ' : ''}${document.title} — Writree`)
  }, [document?.saveState, document?.title])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void state.saveActive() }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true) }
      if (event.key.toLowerCase() === 'e') { event.preventDefault(); state.setMode(state.mode === 'source' ? 'wysiwyg' : 'source') }
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); void state.chooseWorkspace() }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); void state.createDocument() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.mode, state.saveActive, state.chooseWorkspace])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.values(state.documents).some((item) => item.saveState === 'dirty' || item.saveState === 'saving')) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [state.documents])

  return (
    <div className="app" data-theme={state.theme}>
      <header className="topbar">
        <Brand />
        <button className="workspace-button" onClick={() => void state.chooseWorkspace()}><FolderOpen size={15} /><span>{state.workspace?.name ?? '폴더 열기'}</span></button>
        <div className="topbar-spacer" />
        {document && <div className="mode-switch" aria-label="편집 모드">
          <button className={state.mode === 'wysiwyg' ? 'active' : ''} onClick={() => state.setMode('wysiwyg')}><TextCursorInput size={14} /> 편집</button>
          <button className={state.mode === 'source' ? 'active' : ''} onClick={() => state.setMode('source')}><Code2 size={14} /> 소스</button>
        </div>}
        <button className="icon-button" onClick={() => setSearchOpen((value) => !value)} title="찾기 및 바꾸기 (Ctrl+F)"><Search size={16} /></button>
        <button className={`icon-button ${rightPanel === 'outline' ? 'active' : ''}`} onClick={() => setRightPanel('outline')} title="문서 개요"><ListTree size={16} /></button>
        <button className={`icon-button ${rightPanel === 'git' ? 'active' : ''}`} onClick={() => setRightPanel('git')} title="Git"><GitBranch size={16} /></button>
        <button className={`icon-button ${rightPanel === 'sync' ? 'active' : ''}`} onClick={() => setRightPanel('sync')} title="동기화"><Cloud size={16} /></button>
        <button className="icon-button" onClick={state.toggleTheme} title="테마 전환">{state.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
      </header>

      <main className="workspace-layout">
        <aside className="sidebar left-sidebar">
          <div className="sidebar-title"><span>WORKSPACE</span><button className="icon-button small" onClick={() => void state.createDocument()} title="새 Markdown 파일 (Ctrl+N)" aria-label="새 Markdown 파일"><FilePlus2 size={14} /></button></div>
          {state.workspace ? <FileTree nodes={state.workspace.files} activePath={state.activePath} gitEntries={state.git?.entries ?? []} onOpen={(path) => void state.openDocument(path)} /> : <Welcome onOpen={() => void state.chooseWorkspace()} />}
        </aside>

        <section className="editor-shell">
          <TabBar tabs={state.tabs} documents={state.documents} activePath={state.activePath} onActivate={state.setActive} onClose={state.closeDocument} />
          {searchOpen && document && <SearchBar markdown={document.markdown} onChange={state.updateMarkdown} onClose={() => setSearchOpen(false)} />}
          {document?.saveState === 'conflict' && <div className="conflict-bar">
            <span>외부에서 파일이 변경되어 자동 저장을 멈췄습니다.</span>
            <button className="primary-button" onClick={() => void state.preserveActiveAsCopy()}>내 편집본을 별도 파일로 보존</button>
            <button className="secondary-button" onClick={() => void state.reloadActiveFromDisk()}>디스크 버전 다시 불러오기</button>
          </div>}
          <div className="editor-stage">
            {document && state.workspace ? (
              <EditorPane rootPath={state.workspace.rootPath} document={document} mode={state.mode} dark={state.theme === 'dark'} onChange={state.updateMarkdown} onError={state.setDocumentError} onModeFallback={() => state.setMode('source')} />
            ) : <EmptyEditor onOpen={() => void state.chooseWorkspace()} />}
          </div>
          <footer className="statusbar">
            <span className={`status-save ${document?.saveState ?? 'saved'}`}>{saveLabel(document?.saveState)}</span>
            <span>{state.git?.branch ? `⑂ ${state.git.branch}` : ''}</span>
            <span className="statusbar-spacer" />
            <span>{stats.words} words</span><span>{stats.characters} chars</span><span>{stats.lines} lines</span><span>Markdown</span>
          </footer>
        </section>

        <aside className="sidebar right-sidebar">
          {rightPanel === 'outline' && <OutlinePanel markdown={document?.markdown ?? ''} />}
          {rightPanel === 'git' && <GitPanel />}
          {rightPanel === 'sync' && <SyncPanel />}
        </aside>
      </main>

      {state.loading && <div className="loading-overlay">불러오는 중…</div>}
      {state.message && <button className="toast" onClick={state.dismissMessage}>{state.message}</button>}
    </div>
  )
}

function Welcome({ onOpen }: { onOpen(): void }) {
  return <div className="welcome-card"><span className="welcome-tree">⌁</span><h2>글이 자라는 곳</h2><p>Markdown 폴더를 열어 시작하세요.</p><button className="primary-button" onClick={onOpen}><FolderOpen size={15} /> 폴더 열기</button></div>
}

function EmptyEditor({ onOpen }: { onOpen(): void }) {
  return <div className="empty-editor"><div className="empty-logo">W</div><h1>Write naturally.</h1><p>로컬 파일을 그대로 두고, 필요한 순간에만 Git으로 기록하세요.</p><button className="primary-button" onClick={onOpen}><FolderOpen size={15} /> 워크스페이스 열기</button></div>
}

function saveLabel(state?: string) {
  if (state === 'dirty') return '저장 대기'
  if (state === 'saving') return '저장 중…'
  if (state === 'conflict') return '외부 변경 충돌'
  if (state === 'error') return '저장 오류'
  return '저장됨'
}
