import type { Root } from 'hast'
import { visit } from 'unist-util-visit'

interface Options {
  prefix?: string
}

export function rehypeHeadingIds(options: Options = {}) {
  const prefix = options.prefix || 'heading-'
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (/^h[1-6]$/.test(node.tagName) && node.properties) {
        const text = (node.children || [])
          .filter(c => c.type === 'text')
          .map(c => (c as any).value)
          .join('')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w-]/g, '')
        if (text) {
          node.properties.id = `${prefix}${text}`
        }
      }
    })
  }
}
