import { X } from 'lucide-react'
import type { OpenDocument } from '../core/types'

export function TabBar({
  tabs,
  documents,
  activePath,
  onActivate,
  onClose,
}: {
  tabs: string[]
  documents: Record<string, OpenDocument>
  activePath: string | null
  onActivate(path: string): void
  onClose(path: string): void
}) {
  return (
    <div className="tab-bar" role="tablist" aria-label="열린 문서">
      {tabs.map((path) => {
        const document = documents[path]
        if (!document) return null
        return (
          <button key={path} role="tab" aria-selected={activePath === path} className={`tab ${activePath === path ? 'active' : ''}`} onClick={() => onActivate(path)}>
            <span className={`save-dot ${document.saveState}`} aria-label={document.saveState} />
            <span>{document.title}</span>
            <span className="tab-close" role="button" aria-label={`${document.title} 닫기`} onClick={(event) => { event.stopPropagation(); onClose(path) }}><X size={13} /></span>
          </button>
        )
      })}
    </div>
  )
}
