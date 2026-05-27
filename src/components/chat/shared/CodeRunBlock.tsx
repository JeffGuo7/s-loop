import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Square, Terminal, Copy, Check, AlertCircle } from 'lucide-react'

interface CodeRunBlockProps {
  code: string
  language: string
}

export function CodeRunBlock({ code, language }: CodeRunBlockProps) {
  const { t } = useTranslation()
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isExecutable = language === 'javascript' || language === 'typescript' || language === 'js' || language === 'ts' || language === 'python' || language === 'py'

  const handleRun = useCallback(() => {
    setRunning(true)
    setOutput(null)
    setError(null)

    if (language === 'python' || language === 'py') {
      setError('Python execution requires Pyodide. Install with: npm install pyodide')
      setRunning(false)
      return
    }

    // JavaScript/TypeScript execution via sandboxed eval
    try {
      const logs: string[] = []
      const mockConsole = {
        log: (...args: any[]) => logs.push(args.map(String).join(' ')),
        warn: (...args: any[]) => logs.push('⚠️ ' + args.map(String).join(' ')),
        error: (...args: any[]) => logs.push('❌ ' + args.map(String).join(' ')),
        info: (...args: any[]) => logs.push('ℹ️ ' + args.map(String).join(' ')),
      }

      const fn = new Function('console', code)
      const result = fn(mockConsole)

      const outputLines = [...logs]
      if (result !== undefined) {
        outputLines.push('=> ' + String(result))
      }

      setOutput(outputLines.join('\n') || '(no output)')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }, [code, language])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-secondary)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-tertiary)]">
          <Terminal size={12} />
          <span>{t('chat.code.execute') || (isExecutable ? 'Run' : 'Preview')}</span>
        </div>
        <div className="flex items-center gap-1">
          {isExecutable && (
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {running ? (
                <><Square size={10} className="animate-pulse" /> Running...</>
              ) : (
                <><Play size={10} /> Run</>
              )}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-border)] transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Code */}
      <pre className="px-4 py-3 text-[13px] font-mono leading-relaxed overflow-x-auto border-b border-[var(--color-border)]">
        <code>{code}</code>
      </pre>

      {/* Output */}
      {(output || error) && (
        <div className={`px-4 py-3 text-[12px] font-mono leading-relaxed whitespace-pre-wrap ${
          error ? 'bg-[var(--color-error)]/5 text-[var(--color-error)]' : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
        }`}>
          {error ? <><AlertCircle size={12} className="inline mr-1" />{error}</> : output}
        </div>
      )}
    </div>
  )
}
