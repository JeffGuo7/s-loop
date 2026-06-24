// Tool result truncation helpers to keep context from exploding.

export const DEFAULT_MAX_BYTES = 50 * 1024
export const DEFAULT_MAX_LINES = 2000
export const DEFAULT_MAX_LINE_LENGTH = 500

function utf8ByteLength(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(str, 'utf8')
  }
  let bytes = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else bytes += 3
  }
  return bytes
}

function splitLines(text) {
  if (text.length === 0) return []
  const lines = text.split('\n')
  if (text.endsWith('\n')) lines.pop()
  return lines
}

/** Truncate plain text by byte and line count. */
export function truncateText(text, { maxBytes = DEFAULT_MAX_BYTES, maxLines = DEFAULT_MAX_LINES, maxLineLength = DEFAULT_MAX_LINE_LENGTH } = {}) {
  if (typeof text !== 'string') return { content: String(text ?? ''), truncated: false }

  const totalBytes = utf8ByteLength(text)
  const totalLines = splitLines(text).length

  let truncatedBy = null
  let output = text

  // Truncate by lines first
  if (totalLines > maxLines) {
    const lines = splitLines(text)
    output = lines.slice(0, maxLines).join('\n')
    truncatedBy = 'lines'
  }

  // Then enforce byte limit from the head
  if (utf8ByteLength(output) > maxBytes) {
    let bytes = 0
    let cutIndex = output.length
    for (let i = 0; i < output.length; i++) {
      const code = output.charCodeAt(i)
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3
      if (bytes > maxBytes) {
        cutIndex = i
        break
      }
    }
    output = output.slice(0, cutIndex)
    truncatedBy = 'bytes'
  }

  // Enforce per-line length for grep-like output
  if (maxLineLength > 0) {
    const lines = splitLines(output)
    let lineTruncated = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > maxLineLength) {
        lines[i] = lines[i].slice(0, maxLineLength) + ' …'
        lineTruncated = true
      }
    }
    if (lineTruncated) {
      output = lines.join('\n')
    }
  }

  const truncated = output !== text
  const result = truncated
    ? `${output}\n\n[Content truncated: ${truncatedBy === 'lines' ? `${totalLines} lines` : `${totalBytes} bytes`} → kept ${truncatedBy === 'lines' ? maxLines + ' lines' : maxBytes + ' bytes'}]`
    : output

  return {
    content: result,
    truncated,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: splitLines(output).length,
    outputBytes: utf8ByteLength(output),
  }
}

/** Truncate a message content array in place, returning a new array. */
export function truncateContent(content, options = {}) {
  if (typeof content === 'string') {
    return truncateText(content, options).content
  }
  if (!Array.isArray(content)) return content

  return content.map((block) => {
    if (!block || typeof block !== 'object') return block
    if (block.type === 'text' && typeof block.text === 'string') {
      const { content: truncatedText } = truncateText(block.text, options)
      return { ...block, text: truncatedText }
    }
    return block
  })
}

/** Truncate a tool result message, returning a new message. */
export function truncateToolResult(message, options = {}) {
  if (message?.role !== 'toolResult') return message
  return {
    ...message,
    content: truncateContent(message.content, options),
  }
}
