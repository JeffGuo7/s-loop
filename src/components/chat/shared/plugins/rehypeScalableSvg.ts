import type { Root } from 'hast'
import { visit } from 'unist-util-visit'

export function rehypeScalableSvg() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'svg') {
        const props = node.properties || {}
        if (!props.viewBox) {
          const width = parseFloat(props.width as string) || 0
          const height = parseFloat(props.height as string) || 0
          if (width && height) {
            props.viewBox = `0 0 ${width} ${height}`
          }
        }
        if (typeof props.width === 'string' && !props.width.includes('%')) {
          props.width = '100%'
        }
        if (typeof props.height === 'string' && !props.height.includes('%')) {
          props.height = 'auto'
        }
        props.style = [props.style as string || '', 'max-width:100%;height:auto'].filter(Boolean).join(';')
      }
    })
  }
}
