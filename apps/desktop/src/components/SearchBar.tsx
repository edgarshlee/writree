import { Replace, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { replaceAllLiteral } from '../core/markdown'

export function SearchBar({ markdown, onChange, onClose }: { markdown: string; onChange(value: string): void; onClose(): void }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const count = useMemo(() => query ? markdown.split(query).length - 1 : 0, [markdown, query])

  return (
    <div className="search-bar" role="search">
      <Search size={15} />
      <input autoFocus aria-label="찾기" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="찾기" />
      <span className="search-count">{count}개</span>
      <Replace size={15} />
      <input aria-label="바꾸기" value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="바꿀 내용" />
      <button className="secondary-button compact" disabled={!count} onClick={() => onChange(replaceAllLiteral(markdown, query, replacement).value)}>모두 바꾸기</button>
      <button className="icon-button" onClick={onClose} aria-label="검색 닫기"><X size={15} /></button>
    </div>
  )
}
