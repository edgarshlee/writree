import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { useEffect, useRef } from 'react'

export function SourceEditor({ value, onChange, dark }: { value: string; onChange(value: string): void; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        markdown(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', background: 'transparent' },
          '.cm-scroller': { fontFamily: '"Cascadia Code", "JetBrains Mono", monospace', fontSize: '14px', lineHeight: '1.75' },
          '.cm-content': { padding: '34px 0 80px' },
          '.cm-line': { padding: '0 42px' },
          '.cm-gutters': { background: 'transparent', border: 'none', color: dark ? '#625f59' : '#b2aa9d' },
          '&.cm-focused': { outline: 'none' },
        }, { dark }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: host.current })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // Theme changes intentionally recreate the editor without changing its text.
  }, [dark])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="source-editor" data-testid="source-editor" />
}
