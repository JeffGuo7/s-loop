let highlighter: any = null

async function getHighlighter() {
  if (!highlighter) {
    const shiki = await import('shiki')
    highlighter = await shiki.createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'javascript', 'typescript', 'python', 'css', 'html', 'json', 'bash',
        'shell', 'sql', 'rust', 'go', 'java', 'ruby', 'php', 'c', 'cpp',
        'yaml', 'markdown', 'xml', 'dockerfile', 'graphql', 'plaintext',
      ],
    })
  }
  return highlighter
}

export interface HighlightRequest {
  id: string
  code: string
  language: string
  theme: 'github-dark' | 'github-light'
}

export interface HighlightResponse {
  id: string
  html: string
}

let workerPromise: Promise<Worker> | null = null

function createWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise

  const workerCode = `
    self.onmessage = async (e) => {
      const { id, code, language, theme } = e.data
      try {
        const { createHighlighter } = await import('shiki')
        const hl = await createHighlighter({
          themes: ['github-dark', 'github-light'],
          langs: ['javascript', 'typescript', 'python', 'css', 'html', 'json', 'bash', 'shell', 'sql', 'rust', 'go', 'java', 'ruby', 'php', 'c', 'cpp', 'yaml', 'markdown', 'xml', 'dockerfile', 'graphql', 'plaintext'],
        })
        const html = hl.codeToHtml(code, { lang: language || 'text', theme })
        self.postMessage({ id, html })
      } catch (err) {
        self.postMessage({ id, html: '<pre><code>' + code.replace(/</g, '&lt;') + '</code></pre>' })
      }
    }
  `

  const blob = new Blob([workerCode], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  workerPromise = Promise.resolve(new Worker(url))
  return workerPromise
}

export async function highlightInWorker(request: HighlightRequest): Promise<HighlightResponse> {
  const worker = await createWorker()
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      if (e.data.id === request.id) {
        worker.removeEventListener('message', handler)
        resolve(e.data)
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage(request)
  })
}
