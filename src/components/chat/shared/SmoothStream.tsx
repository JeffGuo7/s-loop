import { useCallback, useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'

interface SmoothStreamProps {
  text: string
  isStreaming: boolean
}

const languages = ['en-US', 'de-DE', 'es-ES', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'ru-RU', 'fr-FR']
const segmenter = new Intl.Segmenter(languages)

/**
 * EXACT replica of Cherry Studio's useSmoothStream + Markdown content update pattern.
 * 
 * Key differences from the previous (broken) version:
 * - Tracks previous content via ref, computes delta on each update
 * - Delta is split into individual graphemes and appended to queue
 * - RAF renderLoop runs continuously (not restarted on each prop change)
 * - streamDone is tracked via a ref (not closure-captured)
 * - onUpdate (setDisplayed) is stable (useState setter)
 */
export function SmoothStream({ text, isStreaming }: SmoothStreamProps) {
  const [displayed, setDisplayed] = useState('')

  // Refs for the smooth stream state machine
  const chunkQueueRef = useRef<string[]>([])
  const displayedTextRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const lastUpdateRef = useRef(0)
  const prevContentRef = useRef('')
  const streamDoneRef = useRef(!isStreaming)

  // Keep streamDoneRef in sync with isStreaming
  streamDoneRef.current = !isStreaming

  // On each text change, compute delta and add to queue
  useEffect(() => {
    const newContent = text || ''
    const oldContent = prevContentRef.current

    if (!oldContent && newContent) {
      // First content: queue all of it (don't show immediately)
      const chars = Array.from(segmenter.segment(newContent)).map(s => s.segment)
      chunkQueueRef.current = chars
      prevContentRef.current = newContent
      return
    }

    if (oldContent && newContent && !newContent.startsWith(oldContent)) {
      // Content reset: replace everything
      chunkQueueRef.current = []
      const chars = Array.from(segmenter.segment(newContent)).map(s => s.segment)
      chunkQueueRef.current = chars
      displayedTextRef.current = ''
      prevContentRef.current = newContent
      return
    }

    // Normal streaming: compute delta
    const delta = newContent.substring(oldContent.length)
    if (delta) {
      const chars = Array.from(segmenter.segment(delta)).map(s => s.segment)
      chunkQueueRef.current = [...chunkQueueRef.current, ...chars]
    }

    prevContentRef.current = newContent
  }, [text])

  // RAF render loop — starts once, runs forever until cleanup
  useEffect(() => {
    const MIN_DELAY = 10 // ms

    function renderLoop(time: number) {
      const isDone = streamDoneRef.current

      if (chunkQueueRef.current.length === 0) {
        if (isDone) {
          // Streaming done, queue empty — show final text
          setDisplayed(displayedTextRef.current)
          return // Stop the loop
        }
        // Still streaming but queue empty — wait for more chunks
        rafRef.current = requestAnimationFrame(renderLoop)
        return
      }

      // Throttle: minimum delay between updates
      if (time - lastUpdateRef.current < MIN_DELAY) {
        rafRef.current = requestAnimationFrame(renderLoop)
        return
      }
      lastUpdateRef.current = time

      // Adaptive batch: natural speed variation (fast flow = bigger batches)
      const charsToRender = isDone
        ? chunkQueueRef.current.length // flush all when done
        : Math.max(1, Math.floor(chunkQueueRef.current.length / 5))

      const chunk = chunkQueueRef.current.splice(0, charsToRender)
      displayedTextRef.current += chunk.join('')

      // Update React state
      setDisplayed(displayedTextRef.current)

      // Continue if there's more to render or still streaming
      if (chunkQueueRef.current.length > 0 || !isDone) {
        rafRef.current = requestAnimationFrame(renderLoop)
      }
    }

    // Start the loop
    rafRef.current = requestAnimationFrame(renderLoop)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, []) // Empty deps — loop runs continuously, uses refs for all state

  return <Markdown>{displayed}</Markdown>
}
