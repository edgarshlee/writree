import { defaultValueCtx, Editor, rootCtx } from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { replaceAll } from '@milkdown/kit/utils'
import { useEffect, useRef } from 'react'
import { joinFrontmatter, splitFrontmatter } from '../core/markdown'

export function MilkdownEditor({ value, documentKey, onChange, onImage, onResolveImage, onParseError }: { value: string; documentKey: string; onChange(value: string): void; onImage(file: File): Promise<string>; onResolveImage(path: string): Promise<string>; onParseError(message: string): void }) {
  const host = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const emittedValue = useRef(value)
  const frontmatterRef = useRef(splitFrontmatter(value).frontmatter)
  const bodyValueRef = useRef(splitFrontmatter(value).body)
  const onChangeRef = useRef(onChange)
  const onParseErrorRef = useRef(onParseError)
  const onResolveImageRef = useRef(onResolveImage)
  onChangeRef.current = onChange
  onParseErrorRef.current = onParseError
  onResolveImageRef.current = onResolveImage

  useEffect(() => {
    if (!host.current) return
    emittedValue.current = value
    const initial = splitFrontmatter(value)
    frontmatterRef.current = initial.frontmatter
    bodyValueRef.current = initial.body
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host.current!)
        ctx.set(defaultValueCtx, initial.body)
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previous) => {
          if (markdown !== previous) {
            bodyValueRef.current = markdown
            const next = joinFrontmatter(frontmatterRef.current, markdown)
            emittedValue.current = next
            onChangeRef.current(next)
          }
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(cursor)
      .use(trailing)
      .use(listener)

    const hydrated = new WeakSet<HTMLImageElement>()
    const hydrateImages = () => {
      host.current?.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
        const source = image.getAttribute('src') ?? ''
        if (hydrated.has(image) || /^(?:data:|https?:|blob:)/i.test(source)) return
        hydrated.add(image)
        void onResolveImageRef.current(source.replace(/^\.\//, ''))
          .then((resolved) => { image.src = resolved })
          .catch(() => { hydrated.delete(image) })
      })
    }
    const observer = new MutationObserver(hydrateImages)
    observer.observe(host.current, { childList: true, subtree: true })
    void editor.create()
      .then(() => { editorRef.current = editor; hydrateImages() })
      .catch((error) => onParseErrorRef.current(`Markdown을 시각 편집기로 변환하지 못했습니다. 원문은 소스 모드에 보존됩니다: ${String(error)}`))
    return () => { observer.disconnect(); editorRef.current = null; void editor.destroy() }
    // Recreate only when a different tab becomes active.
  }, [documentKey])

  useEffect(() => {
    if (!editorRef.current || value === emittedValue.current) return
    emittedValue.current = value
    const next = splitFrontmatter(value)
    frontmatterRef.current = next.frontmatter
    bodyValueRef.current = next.body
    try {
      editorRef.current.action(replaceAll(next.body))
    } catch (error) {
      onParseErrorRef.current(`Markdown을 시각 편집기로 변환하지 못했습니다. 원문은 소스 모드에 보존됩니다: ${String(error)}`)
    }
  }, [value])

  async function insertImage(file: File) {
    const path = await onImage(file)
    const markdown = `![${file.name}](${path})`
    if (editorRef.current) editorRef.current.action(replaceAll(`${bodyValueRef.current}\n\n${markdown}\n`))
  }

  return (
    <div
      className="milkdown-editor"
      data-testid="wysiwyg-editor"
      onPaste={(event) => {
        const image = [...event.clipboardData.files].find((file) => file.type.startsWith('image/'))
        if (image) { event.preventDefault(); void insertImage(image) }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const image = [...event.dataTransfer.files].find((file) => file.type.startsWith('image/'))
        if (image) { event.preventDefault(); void insertImage(image) }
      }}
    >
      <div ref={host} />
    </div>
  )
}
