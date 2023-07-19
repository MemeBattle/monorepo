import { visit } from 'unist-util-visit'

const headingsSet = new Set(['h2', 'h3', 'h4', 'h5'])

export function addTOCRehypePlugin() {
  /**
   * Visit heading elements and collect them to array
   *
   * @param {import('unist').Node<import('unist').Data>} tree
   * @param {{data: {rawDocumentData: { headings: import('../types').HeadingsItem[] }}}} file
   * @returns void
   */
  return (tree, vFile) => {
    vFile.data.rawDocumentData.headings = []
    visit(
      tree,
      element => headingsSet.has(element.tagName),
      node => {
        vFile.data.rawDocumentData.headings.push({
          level: +node.tagName[1],
          value: node.children[0]?.children[0]?.value,
          slug: node.properties.id,
        })
      },
    )
  }
}
