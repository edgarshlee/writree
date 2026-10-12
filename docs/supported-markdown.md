# Supported Markdown

The visual editor targets CommonMark and GFM: headings, emphasis, links,
images, lists, task lists, blockquotes, tables, fenced code, and thematic
breaks. YAML frontmatter and unsupported/HTML blocks remain available in source
mode.

Switching from visual to source mode serializes the document; switching back
parses it again. Meaning is preserved, but insignificant whitespace and list
markers can be normalized. Review these representation-only changes in the Git
diff panel before committing.
