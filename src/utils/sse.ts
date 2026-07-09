/**
 * Read a Server-Sent Events stream from a fetch reader and dispatch each
 * `event:`/`data:` pair to `onEvent`.
 *
 * The pi-server SSE framing sends an `event: <type>` line immediately followed
 * by a `data: <json>` line. This helper handles the low-level buffering,
 * line-splitting and JSON parsing that was previously duplicated across every
 * streaming consumer. Return `true` from `onEvent` to stop consuming early
 * (e.g. on a terminal `done` event).
 */
export async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (eventType: string, data: any) => boolean | void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let lineEnd = buffer.indexOf('\n')
    while (lineEnd !== -1) {
      const line = buffer.slice(0, lineEnd)
      buffer = buffer.slice(lineEnd + 1)
      lineEnd = buffer.indexOf('\n')

      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':')) continue

      if (trimmed.startsWith('event: ')) {
        const eventType = trimmed.slice(7)
        // The data line follows immediately on the next line.
        const nextEnd = buffer.indexOf('\n')
        const dataLine = nextEnd === -1 ? buffer.trim() : buffer.slice(0, nextEnd).trim()
        let stop = false
        if (dataLine.startsWith('data: ')) {
          try {
            const data = JSON.parse(dataLine.slice(6))
            stop = onEvent(eventType, data) === true
          } catch { /* skip invalid JSON */ }
        }
        // Consume the data line.
        if (nextEnd !== -1) {
          buffer = buffer.slice(nextEnd + 1)
          lineEnd = buffer.indexOf('\n')
        }
        if (stop) return
      }
    }
  }
}
