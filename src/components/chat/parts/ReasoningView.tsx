import { Brain } from 'lucide-react'
import { Collapsible, Markdown } from '../shared'
import type { ReasoningPart } from '../../../types'

interface ReasoningViewProps {
  part: ReasoningPart
  defaultExpanded?: boolean
}

export function ReasoningView({ part, defaultExpanded = false }: ReasoningViewProps) {
  if (!part.text) return null

  return (
    <Collapsible
      header={
        <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
          <Brain size={14} />
          <span>Thinking...</span>
        </span>
      }
      defaultExpanded={defaultExpanded}
      className="my-2"
    >
      <div className="text-sm text-[var(--color-text-secondary)] italic">
        <Markdown>{part.text}</Markdown>
      </div>
    </Collapsible>
  )
}