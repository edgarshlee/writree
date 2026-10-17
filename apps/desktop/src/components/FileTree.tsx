import { ChevronDown, ChevronRight, FilePenLine, FileText, Folder, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { FileNode, GitStatusEntry } from '../core/types'

interface FileTreeProps {
  nodes: FileNode[]
  activePath: string | null
  gitEntries: GitStatusEntry[]
  onOpen(path: string): void
  onRename(path: string): void
}

export function FileTree({ nodes, activePath, gitEntries, onOpen, onRename }: FileTreeProps) {
  const gitMap = new Map(gitEntries.map((entry) => [entry.path.replace(/\\/g, '/'), entry]))
  return <div className="file-tree">{nodes.map((node) => <TreeNode key={node.path} node={node} activePath={activePath} gitMap={gitMap} onOpen={onOpen} onRename={onRename} />)}</div>
}

function TreeNode({
  node,
  activePath,
  gitMap,
  onOpen,
  onRename,
}: {
  node: FileNode
  activePath: string | null
  gitMap: Map<string, GitStatusEntry>
  onOpen(path: string): void
  onRename(path: string): void
}) {
  const [expanded, setExpanded] = useState(true)
  const entry = gitMap.get(node.path.replace(/\\/g, '/'))

  if (node.kind === 'directory') {
    return (
      <div>
        <button className="tree-row directory" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span>{node.name}</span>
        </button>
        {expanded && <div className="tree-children">{node.children?.map((child) => <TreeNode key={child.path} node={child} activePath={activePath} gitMap={gitMap} onOpen={onOpen} onRename={onRename} />)}</div>}
      </div>
    )
  }

  return <div className={`tree-entry ${activePath === node.path ? 'active' : ''}`}>
    <button
      className="tree-row file"
      onClick={() => onOpen(node.path)}
      onContextMenu={(event) => { event.preventDefault(); onRename(node.path) }}
      title={`${node.path} · 우클릭하여 이름 변경`}
    >
      <span className="tree-spacer" />
      <FileText size={15} />
      <span className="tree-label">{node.name}</span>
      {entry && <span className={`git-badge ${entry.state}`}>{badge(entry)}</span>}
    </button>
    <button className="tree-rename" onClick={() => onRename(node.path)} title="이름 변경 (F2)" aria-label={`파일명 변경: ${node.name}`}><FilePenLine size={13} /></button>
  </div>
}

function badge(entry: GitStatusEntry) {
  if (entry.state === 'untracked') return 'U'
  if (entry.state === 'added') return 'A'
  if (entry.state === 'deleted') return 'D'
  if (entry.state === 'renamed') return 'R'
  if (entry.state === 'conflicted') return '!'
  return 'M'
}
