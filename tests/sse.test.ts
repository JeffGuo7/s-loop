import { describe, it, expect } from 'vitest'
import { readSSEStream } from '../src/utils/sse'

function readerFromChunks(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return stream.getReader()
}

describe('readSSEStream', () => {
  it('dispatches parsed event/data pairs in order', async () => {
    const reader = readerFromChunks([
      'event: text_delta\ndata: {"delta":"Hello"}\n',
      'event: text_delta\ndata: {"delta":" world"}\n',
      'event: done\ndata: {}\n',
    ])
    const events: Array<[string, any]> = []
    await readSSEStream(reader, (type, data) => {
      events.push([type, data])
    })
    expect(events).toEqual([
      ['text_delta', { delta: 'Hello' }],
      ['text_delta', { delta: ' world' }],
      ['done', {}],
    ])
  })

  it('stops consuming when the callback returns true', async () => {
    const reader = readerFromChunks([
      'event: a\ndata: {"n":1}\n',
      'event: done\ndata: {}\n',
      'event: b\ndata: {"n":2}\n',
    ])
    const seen: string[] = []
    await readSSEStream(reader, (type) => {
      seen.push(type)
      if (type === 'done') return true
    })
    expect(seen).toEqual(['a', 'done'])
  })

  it('reassembles a frame split across chunk boundaries', async () => {
    // The event line and its data line arrive together (as pi-server writes
    // them), but the frame is split mid-line across chunks.
    const reader = readerFromChunks(['event: text_de', 'lta\ndata: {"delta":"hi"}\n'])
    const events: Array<[string, any]> = []
    await readSSEStream(reader, (type, data) => {
      events.push([type, data])
    })
    expect(events).toEqual([['text_delta', { delta: 'hi' }]])
  })

  it('skips comments, blank lines and invalid JSON', async () => {
    const reader = readerFromChunks([
      ': keep-alive comment\n',
      '\n',
      'event: bad\ndata: {not json}\n',
      'event: good\ndata: {"ok":true}\n',
    ])
    const events: Array<[string, any]> = []
    await readSSEStream(reader, (type, data) => {
      events.push([type, data])
    })
    expect(events).toEqual([['good', { ok: true }]])
  })
})
