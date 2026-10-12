import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { FileNode, GitStatusEntry } from '../core/types'

interface FileTreeProps {
  nodes: FileNode[]
  activePath: string | null
  gitEntries: GitStatusEntry[]
  onOpen(path: string): void
}

export function FileTree({ nodes, activePath, gitEntries, onOpen }: FileTreeProps) {
  const gitMap = new Map(gitEntries.map((entry) => [entry.path.replace(/\\/g, '/'), entry]))
  return <div className="file-tree">{nodes.map((node) => <TreeNode key={node.path} node={node} activePath={activePath} gitMap={gitMap} onOpen={onOpen} />)}</div>
}

function TreeNode({
  node,
  activePath,
  gitMap,
  onOpen,
}: {
  node: FileNode
  activePath: string | null
  gitMap: Map<string, GitStatusEntry>
  onOpen(path: string): void
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
        {expanded && <div className="tree-children">{node.children?.map((child) => <TreeNode key={child.path} node={child} activePath={activePath} gitMap={gitMap} onOpen={onOpen} />)}</div>}
      </div>
    )
  }

  return (
    <button className={`tree-row file ${activePath === node.path ? 'active' : ''}`} onClick={() => onOpen(node.path)} title={node.path}>
      <span className="tree-spacer" />
      <FileText size={15} />
      <span className="tree-label">{node.name}</span>
      {entry && <span className={`git-badge ${entry.state}`}>{badge(entry)}</span>}
    </button>
  )
}

function badge(entry: GitStatusEntry) {
  if (entry.state === 'untracked') return 'U'
  if (entry.state === 'added') return 'A'
  if (entry.state === 'deleted') return 'D'
  if (entry.state === 'renamed') return 'R'
  if (entry.state === 'conflicted') return '!'
  return 'M'
}
