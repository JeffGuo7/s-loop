import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'

const LANG_EXTENSIONS: Record<string, any> = {
  javascript, js: javascript, jsx: javascript, tsx: javascript,
  typescript: javascript, ts: javascript,
  python, py: python,
  json,
  html,
  css,
  markdown, md: markdown,
  xml, svg: xml,
  sql,
}

interface CodeEditorBlockProps {
  code: string
  language: string
}

export function CodeEditorBlock({ code, language }: CodeEditorBlockProps) {
  const extensions = useMemo(() => {
    const langFn = LANG_EXTENSIONS[language]
    return langFn ? [langFn()] : []
  }, [language])

  return (
    <CodeMirror
      value={code}
      extensions={extensions}
      theme={oneDark}
      height="auto"
      maxHeight="60vh"
      editable={true}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
      }}
    />
  )
}
