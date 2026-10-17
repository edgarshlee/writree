import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserBridge } from './browserBridge'

describe('BrowserBridge safe save behavior', () => {
  beforeEach(() => localStorage.clear())

  it('rejects an overwrite when the expected hash is stale', async () => {
    const bridge = new BrowserBridge()
    const original = await bridge.readDocument('Writree Demo', 'README.md')
    await bridge.saveDocument({
      rootPath: 'Writree Demo',
      relativePath: 'README.md',
      markdown: `${original.markdown}\nfirst`,
      expectedHash: original.contentHash,
      lineEnding: original.lineEnding,
    })

    await expect(bridge.saveDocument({
      rootPath: 'Writree Demo',
      relativePath: 'README.md',
      markdown: `${original.markdown}\nsecond`,
      expectedHash: original.contentHash,
      lineEnding: original.lineEnding,
    })).rejects.toThrow('FILE_CONFLICT')
  })

  it('keeps a remote conflict as a separate Markdown file', async () => {
    const bridge = new BrowserBridge()
    const path = await bridge.writeConflictCopy('Writree Demo', 'notes/draft.md', '# remote', 'Laptop A')
    expect(path).toMatch(/^notes\/draft\.conflict-\d+-laptop-a\.md$/)
    expect((await bridge.openWorkspace('Writree Demo')).files).not.toHaveLength(0)
  })

  it('creates a Markdown document and refuses to overwrite it', async () => {
    const bridge = new BrowserBridge()
    const created = await bridge.createDocument('Writree Demo', 'notes/새 글')
    expect(created.relativePath).toBe('notes/새 글.md')
    expect(created.markdown).toBe('# 새 글\n\n')
    await expect(bridge.createDocument('Writree Demo', 'notes/새 글.md')).rejects.toThrow('이미 있습니다')
  })

  it('renames a Markdown document without overwriting another file', async () => {
    const bridge = new BrowserBridge()
    const renamed = await bridge.renameDocument('Writree Demo', 'README.md', '소개')
    expect(renamed.relativePath).toBe('소개.md')
    await expect(bridge.readDocument('Writree Demo', 'README.md')).rejects.toThrow()
    await expect(bridge.renameDocument('Writree Demo', '소개.md', 'docs/architecture.md')).rejects.toThrow('이미 있습니다')
  })
})
