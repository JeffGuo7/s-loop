import { useEffect, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

interface ShadowDOMProps {
  children: ReactNode
}

export function MarkdownShadowDOM({ children }: ShadowDOMProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<Root | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' })

    if (!rootRef.current) {
      const styleSheets = document.styleSheets
      const markdownStyles: string[] = []
      for (let i = 0; i < styleSheets.length; i++) {
        try {
          const sheet = styleSheets[i]
          const rules = sheet.cssRules || sheet.rules
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              const cssText = rules[j].cssText
              if (cssText && (cssText.includes('.markdown') || cssText.includes('prose') || cssText.includes('code-block'))) {
                markdownStyles.push(cssText)
              }
            }
          }
        } catch {
          // Cross-origin stylesheets can't be read
        }
      }

      const style = document.createElement('style')
      style.textContent = markdownStyles.join('\n')
      shadow.appendChild(style)

      const container = document.createElement('div')
      container.className = 'markdown shadow-root'
      shadow.appendChild(container)
      rootRef.current = createRoot(container)
    }

    rootRef.current.render(children)

    return () => {
      // Keep the shadow root mounted; only unmount when host disappears.
    }
  }, [children])

  useEffect(() => {
    return () => {
      rootRef.current?.unmount()
      rootRef.current = null
    }
  }, [])

  return <div ref={hostRef} />
}

export function StyleWrapper({ children, html }: { children?: ReactNode; html?: string }) {
  if (html) {
    return <MarkdownShadowDOM><div dangerouslySetInnerHTML={{ __html: html }} /></MarkdownShadowDOM>
  }
  return <MarkdownShadowDOM>{children}</MarkdownShadowDOM>
}
