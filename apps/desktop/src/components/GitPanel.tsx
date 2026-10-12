import { GitBranch, RefreshCw, Upload } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspaceStore'

export function GitPanel() {
  const git = useWorkspaceStore((state) => state.git)
  const diff = useWorkspaceStore((state) => state.gitDiff)
  const selected = useWorkspaceStore((state) => state.selectedGitPaths)
  const commitMessage = useWorkspaceStore((state) => state.commitMessage)
  const refresh = useWorkspaceStore((state) => state.refreshGit)
  const toggle = useWorkspaceStore((state) => state.toggleGitPath)
  const loadDiff = useWorkspaceStore((state) => state.loadDiff)
  const setCommitMessage = useWorkspaceStore((state) => state.setCommitMessage)
  const commit = useWorkspaceStore((state) => state.commitSelected)
  const push = useWorkspaceStore((state) => state.push)

  if (!git) return <section className="right-section"><p className="empty-note">Git 저장소가 아닙니다.</p></section>

  return (
    <section className="right-section git-panel">
      <div className="panel-heading">
        <GitBranch size={16} />
        <span>{git.branch ?? 'detached HEAD'}</span>
        <button className="icon-button small" onClick={() => void refresh()} title="Git 상태 새로고침"><RefreshCw size={14} /></button>
      </div>
      {git.operation !== 'normal' && <div className="warning-card">현재 {git.operation} 작업이 진행 중입니다. Writree는 충돌을 자동으로 해결하지 않습니다.</div>}
      <div className="git-file-list">
        {git.entries.length === 0 ? <p className="empty-note">변경 사항이 없습니다.</p> : git.entries.map((entry) => (
          <label key={entry.path} className="git-file" onDoubleClick={() => void loadDiff(entry.path)}>
            <input type="checkbox" checked={selected.includes(entry.path)} onChange={() => toggle(entry.path)} />
            <button onClick={() => void loadDiff(entry.path)} title="diff 보기"><span className={`git-badge ${entry.state}`}>{entry.state.slice(0, 1).toUpperCase()}</span>{entry.path}</button>
          </label>
        ))}
      </div>
      {diff && <pre className="diff-view" aria-label="Git diff">{diff}</pre>}
      <textarea value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="변경 이유를 설명하는 커밋 메시지" rows={3} />
      <div className="git-actions">
        <button className="primary-button" disabled={!selected.length || !commitMessage.trim() || git.operation !== 'normal'} onClick={() => void commit()}>선택 커밋</button>
        <button className="secondary-button" disabled={!git.upstream || git.operation !== 'normal'} onClick={() => void push()}><Upload size={14} /> Push</button>
      </div>
      {!git.upstream && <p className="helper-text">upstream이 없습니다. 먼저 터미널에서 원격 브랜치를 연결해 주세요.</p>}
    </section>
  )
}
