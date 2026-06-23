import { useEffect, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'
import { useAppStore } from '../../stores/appStore'

interface TextPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

function getLanguageExtension(ext: string): (() => Promise<Extension>) | null {
  const imports: Record<string, () => Promise<Extension>> = {
    ts: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: false, typescript: true })),
    tsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
    js: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: false })),
    jsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
    json: () => import('@codemirror/lang-json').then(m => m.json()),
    css: () => import('@codemirror/lang-css').then(m => m.css()),
    html: () => import('@codemirror/lang-html').then(m => m.html()),
    htm: () => import('@codemirror/lang-html').then(m => m.html()),
    py: () => import('@codemirror/lang-python').then(m => m.python()),
    sql: () => import('@codemirror/lang-sql').then(m => m.sql()),
    xml: () => import('@codemirror/lang-xml').then(m => m.xml()),
    md: () => import('@codemirror/lang-markdown').then(m => m.markdown()),
  }
  return imports[ext] || null
}

export function TextPreview({ filePath, onLoaded, onError }: TextPreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [langExts, setLangExts] = useState<Extension[]>([])
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    let cancelled = false
    const ext = filePath.split('.').pop()?.toLowerCase() || ''

    async function load() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const text = await invoke<string>('read_text_file', { path: filePath })
        if (!cancelled) {
          setContent(text)

          const loader = getLanguageExtension(ext)
          if (loader) {
            try {
              const extension = await loader()
              if (!cancelled) setLangExts([extension])
            } catch {
              // ignore lang load errors
            }
          }

          onLoaded()
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath, onLoaded, onError])

  if (content === null) return null

  return (
    <div className="h-full overflow-auto">
      <CodeMirror
        value={content}
        theme={theme === 'dark' ? oneDark : undefined}
        extensions={langExts}
        readOnly={true}
        editable={false}
        className="h-full text-[13px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          bracketMatching: true,
          autocompletion: false,
          searchKeymap: false,
        }}
      />
    </div>
  )
}
