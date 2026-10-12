import { describe, expect, it } from 'vitest'
import {
  applyLineEnding,
  detectLineEnding,
  documentStats,
  extractOutline,
  normalizeLineEndings,
  replaceAllLiteral,
  sanitizeImageName,
  splitFrontmatter,
  joinFrontmatter,
  requiresSourceMode,
  relativeAssetPath,
  resolveWorkspaceRelative,
} from './markdown'

describe('Markdown text invariants', () => {
  it('preserves the chosen LF or CRLF convention', () => {
    const fixture = '---\r\ntitle: 테스트\r\n---\r\n\r\n# 제목\r\n- [x] 완료\r\n'
    expect(detectLineEnding(fixture)).toBe('crlf')
    const normalized = normalizeLineEndings(fixture)
    expect(normalized).toContain('title: 테스트\n---')
    expect(applyLineEnding(normalized, 'crlf')).toBe(fixture)
    expect(applyLineEnding(normalized, 'lf')).not.toContain('\r')
  })

  it('keeps YAML frontmatter outside visual-editor normalization', () => {
    const fixture = '---\ntitle: Writree\ntags: [docs, 한글]\n---\n\n# Body\n'
    const parts = splitFrontmatter(fixture)
    expect(parts.body).toBe('# Body\n')
    expect(joinFrontmatter(parts.frontmatter, parts.body)).toBe(fixture)
  })

  it('ignores headings inside fenced code blocks', () => {
    const fixture = '# 문서\n\n```md\n# 코드 안 제목\n```\n\n## 실제 개요'
    expect(extractOutline(fixture)).toEqual([
      { level: 1, text: '문서', line: 1 },
      { level: 2, text: '실제 개요', line: 7 },
    ])
  })

  it('counts Korean text and performs literal replacement', () => {
    expect(documentStats('한글 문서\n두 번째 줄')).toEqual({ words: 5, characters: 12, lines: 2 })
    expect(replaceAllLiteral('a.b a.b', 'a.b', 'x')).toEqual({ value: 'x x', count: 2 })
  })

  it('creates portable asset names', () => {
    expect(sanitizeImageName(' My Screenshot (1).PNG ')).toBe('my-screenshot-1-.png')
  })

  it('routes raw HTML to source mode without rejecting fenced examples', () => {
    expect(requiresSourceMode('<details>\ntext\n</details>')).toBe(true)
    expect(requiresSourceMode('```html\n<details>\n```')).toBe(false)
  })

  it('writes portable image paths relative to nested documents', () => {
    expect(relativeAssetPath('docs/guides/start.md', 'assets/diagram.png')).toBe('../../assets/diagram.png')
    expect(resolveWorkspaceRelative('docs/guides/start.md', '../../assets/diagram.png')).toBe('assets/diagram.png')
    expect(() => resolveWorkspaceRelative('README.md', '../secret.png')).toThrow('워크스페이스 밖')
  })
})
