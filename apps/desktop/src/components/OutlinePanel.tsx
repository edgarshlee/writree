import { ListTree } from 'lucide-react'
import { extractOutline } from '../core/markdown'

export function OutlinePanel({ markdown }: { markdown: string }) {
  const outline = extractOutline(markdown)
  return (
    <section className="right-section">
      <div className="panel-heading"><ListTree size={16} /><span>문서 개요</span></div>
      {outline.length === 0 ? <p className="empty-note">제목을 입력하면 문서 구조가 표시됩니다.</p> : (
        <nav className="outline-list">
          {outline.map((item, index) => (
            <button key={`${item.line}-${index}`} style={{ paddingLeft: `${12 + (item.level - 1) * 12}px` }} title={`${item.line}번째 줄`}>
              <span>{item.text}</span><small>{item.line}</small>
            </button>
          ))}
        </nav>
      )}
    </section>
  )
}
