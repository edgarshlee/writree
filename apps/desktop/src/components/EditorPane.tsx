import { bridge } from '../infra/bridge'
import { relativeAssetPath, resolveWorkspaceRelative, sanitizeImageName } from '../core/markdown'
import type { EditorMode, OpenDocument } from '../core/types'
import { MilkdownEditor } from './MilkdownEditor'
import { SourceEditor } from './SourceEditor'

export function EditorPane({
  rootPath,
  document,
  mode,
  dark,
  onChange,
  onError,
  onModeFallback,
}: {
  rootPath: string
  document: OpenDocument
  mode: EditorMode
  dark: boolean
  onChange(value: string): void
  onError(message: string): void
  onModeFallback(): void
}) {
  async function saveImage(file: File) {
    try {
      const bytes = [...new Uint8Array(await file.arrayBuffer())]
      const path = await bridge.saveImage(rootPath, sanitizeImageName(file.name), bytes)
      return relativeAssetPath(document.relativePath, path)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onError(message)
      throw error
    }
  }

  if (mode === 'source') {
    return <SourceEditor value={document.markdown} onChange={onChange} dark={dark} />
  }
  return <MilkdownEditor
    value={document.markdown}
    documentKey={document.relativePath}
    onChange={onChange}
    onImage={saveImage}
    onResolveImage={(path) => bridge.readImage(rootPath, resolveWorkspaceRelative(document.relativePath, path))}
    onParseError={(message) => { onError(message); onModeFallback() }}
  />
}
