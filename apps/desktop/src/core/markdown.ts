import type { LineEnding, OutlineItem } from './types'

export function detectLineEnding(value: string): LineEnding {
  return value.includes('\r\n') ? 'crlf' : 'lf'
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n')
}

export function applyLineEnding(value: string, lineEnding: LineEnding): string {
  const normalized = normalizeLineEndings(value)
  return lineEnding === 'crlf' ? normalized.replace(/\n/g, '\r\n') : normalized
}

export function splitFrontmatter(markdown: string) {
  const normalized = normalizeLineEndings(markdown)
  const match = /^(---\n[\s\S]*?\n(?:---|\.\.\.)\n\n?)/.exec(normalized)
  if (!match) return { frontmatter: '', body: normalized }
  return { frontmatter: match[1], body: normalized.slice(match[1].length) }
}

export function joinFrontmatter(frontmatter: string, body: string) {
  return `${frontmatter}${body}`
}

export function requiresSourceMode(markdown: string) {
  const lines = normalizeLineEndings(markdown).split('\n')
  let fenced = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (!fenced) {
      // Milkdown CommonMark handles <br>, <br/>, and <br /> as empty-line or
      // hard-break placeholders, so they are safe in the visual editor.
      const withoutSupportedBreaks = line.replace(/<br\s*\/?\s*>/gi, '')
      if (/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>]*)?>/.test(withoutSupportedBreaks) || /^\s*\$\$/.test(line)) return true
    }
  }
  return false
}

export function relativeAssetPath(documentPath: string, assetPath: string) {
  const from = documentPath.replace(/\\/g, '/').split('/').slice(0, -1)
  const to = assetPath.replace(/\\/g, '/').split('/')
  while (from.length && to.length && from[0] === to[0]) {
    from.shift()
    to.shift()
  }
  return [...from.map(() => '..'), ...to].join('/') || '.'
}

export function resolveWorkspaceRelative(documentPath: string, linkedPath: string) {
  const stack = documentPath.replace(/\\/g, '/').split('/').slice(0, -1)
  for (const part of linkedPath.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!stack.length) throw new Error('워크스페이스 밖의 이미지 경로입니다.')
      stack.pop()
    } else {
      stack.push(part)
    }
  }
  return stack.join('/')
}

export function extractOutline(markdown: string): OutlineItem[] {
  const lines = normalizeLineEndings(markdown).split('\n')
  const result: OutlineItem[] = []
  let fenced = false

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      return
    }
    if (fenced) return
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (match) {
      result.push({ level: match[1].length, text: match[2], line: index + 1 })
    }
  })

  return result
}

export function documentStats(markdown: string) {
  const normalized = normalizeLineEndings(markdown)
  const words = normalized.trim() ? normalized.trim().split(/\s+/u).length : 0
  return {
    words,
    characters: [...normalized].length,
    lines: normalized.length === 0 ? 1 : normalized.split('\n').length,
  }
}

export function replaceAllLiteral(value: string, query: string, replacement: string) {
  if (!query) return { value, count: 0 }
  const parts = value.split(query)
  return { value: parts.join(replacement), count: Math.max(0, parts.length - 1) }
}

export function sanitizeImageName(name: string): string {
  const trimmed = name.trim().toLowerCase()
  const cleaned = trimmed
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || `image-${Date.now()}.png`
}
