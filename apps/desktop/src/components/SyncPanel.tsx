import { Cloud, LogOut, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import { useSyncStore } from '../store/syncStore'

export function SyncPanel() {
  const sync = useSyncStore()
  return (
    <section className="right-section sync-panel">
      <div className="panel-heading"><Cloud size={16} /><span>선택형 동기화</span></div>
      <div className="sync-illustration"><ShieldCheck size={30} /></div>
      <h3>로컬이 항상 원본입니다</h3>
      <p>로그인하지 않아도 편집과 Git 기능을 모두 사용할 수 있습니다. 연결한 워크스페이스만 명시적으로 동기화됩니다.</p>
      {!sync.apiUrl ? (
        <div className="warning-card">서버 URL이 설정되지 않았습니다. 로컬 전용 모드로 실행 중입니다.</div>
      ) : !sync.user ? (
        <button className="primary-button" disabled={sync.status === 'connecting'} onClick={() => void sync.beginLogin()}>
          <Cloud size={14} /> {sync.status === 'connecting' ? '브라우저에서 로그인 중…' : 'GitHub로 로그인'}
        </button>
      ) : sync.enabled ? (
        <>
          <div className="sync-account"><img src={sync.user.avatarUrl ?? undefined} alt="" /><span><strong>{sync.user.displayName ?? sync.user.githubLogin}</strong><small>@{sync.user.githubLogin}</small></span></div>
          <button className="primary-button" disabled={sync.status === 'syncing'} onClick={() => void sync.syncNow()}><RefreshCw size={14} /> {sync.status === 'syncing' ? '동기화 중…' : '지금 동기화'}</button>
          <button className="secondary-button" onClick={() => void sync.disconnectWorkspace()}><Unplug size={14} /> 이 폴더 동기화 해제</button>
        </>
      ) : (
        <>
          <div className="sync-account"><img src={sync.user.avatarUrl ?? undefined} alt="" /><span><strong>{sync.user.displayName ?? sync.user.githubLogin}</strong><small>@{sync.user.githubLogin}</small></span></div>
          <button className="primary-button" onClick={() => void sync.connectWorkspace()}><Cloud size={14} /> 이 폴더 동기화</button>
          <button className="secondary-button" onClick={() => void sync.logout()}><LogOut size={14} /> 로그아웃</button>
        </>
      )}
      {sync.message && <div className={sync.conflicts.length ? 'warning-card' : 'sync-message'}>{sync.message}</div>}
      {sync.conflicts.length > 0 && <ul className="conflict-list">{sync.conflicts.map((path) => <li key={path}>{path}</li>)}</ul>}
      {sync.lastSyncedAt && <p className="helper-text">마지막 동기화: {new Date(sync.lastSyncedAt).toLocaleString()}</p>}
      <p className="helper-text">동기화로 내려온 변경도 Git에는 일반 working-tree 변경으로 표시되며 자동 커밋되지 않습니다.</p>
    </section>
  )
}
