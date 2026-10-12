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
})
