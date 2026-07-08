/**
 * Message formatting for platform delivery.
 *
 * The AI produces GitHub-flavored markdown. Most target platforms render
 * a different (or no) markdown dialect, and getting per-platform rich
 * formatting perfectly right is fragile. We take the robust route:
 * flatten markdown to clean plain text that always displays correctly,
 * then split under each platform's size cap.
 */

/**
 * Flatten markdown to readable plain text. Removes syntax noise while
 * preserving structure: headings keep their text, list markers stay,
 * code fences drop to their content, links become "text (url)".
 */
export function stripMarkdown(md) {
  if (!md) return ''
  let text = String(md)

  // Fenced code blocks → keep inner content, drop the ``` fences
  text = text.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code) => code.replace(/\n$/, ''))
  // Inline code `x` → x
  text = text.replace(/`([^`]+)`/g, '$1')
  // Images ![alt](url) → alt (url)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => (alt ? `${alt} (${url})` : url))
  // Links [text](url) → text (url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  // Headings ### Title → Title
  text = text.replace(/^#{1,6}\s+/gm, '')
  // Bold/italic **x** *x* __x__ _x_ → x
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
  text = text.replace(/(\*|_)(.*?)\1/g, '$2')
  // Blockquote "> x" → x
  text = text.replace(/^>\s?/gm, '')
  // Horizontal rules
  text = text.replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
  // Collapse 3+ blank lines
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

/**
 * Split text into chunks no longer than maxLen, preferring to break on
 * paragraph, then line, then word boundaries. Returns an array of chunks.
 * maxLen of 0/undefined means "no split" (single chunk).
 */
export function splitMessage(text, maxLen) {
  if (!text) return []
  if (!maxLen || text.length <= maxLen) return [text]

  const chunks = []
  let remaining = text

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n\n', maxLen)
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf('\n', maxLen)
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf(' ', maxLen)
    if (cut <= 0) cut = maxLen // hard split as last resort
    chunks.push(remaining.slice(0, cut).trimEnd())
    remaining = remaining.slice(cut).trimStart()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

/**
 * Format + split a message for a given platform.
 * `adapter.formatMessage` overrides the default stripMarkdown when present;
 * `adapter.maxLength` caps chunk size (0 = no split).
 */
export function prepareMessage(adapter, text) {
  const formatted = typeof adapter?.formatMessage === 'function'
    ? adapter.formatMessage(text)
    : stripMarkdown(text)
  return splitMessage(formatted, adapter?.maxLength || 0)
}

