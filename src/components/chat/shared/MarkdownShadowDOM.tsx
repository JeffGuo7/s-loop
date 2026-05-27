import { useEffect, useRef, type ReactNode } from 'react'

interface ShadowDOMProps {
  children: ReactNode
}

export function MarkdownShadowDOM({ children }: ShadowDOMProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || host.shadowRoot) return

    const shadow = host.attachShadow({ mode: 'open' })

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
    container.appendChild(children as HTMLElement)
    shadow.appendChild(container)

    return () => {
      // Cleanup handled by React
    }
  }, [children])

  return <div ref={hostRef} />
}

export function StyleWrapper({ children, html }: { children?: ReactNode; html?: string }) {
  if (html) {
    return <MarkdownShadowDOM><div dangerouslySetInnerHTML={{ __html: html }} /></MarkdownShadowDOM>
  }
  return <MarkdownShadowDOM>{children}</MarkdownShadowDOM>
}
