import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

type ConstructType = 'codeIndented' | 'html' | 'headingAtx' | 'headingSetext'

export function remarkDisableConstructs(disabled: ConstructType[] = []) {
  return (tree: Root) => {
    if (disabled.includes('codeIndented')) {
      visit(tree, 'code', (node: any, index, parent) => {
        if (node.lang === null && !node.meta && parent && typeof index === 'number') {
          parent.children.splice(index, 1)
        }
      })
    }
  }
}
