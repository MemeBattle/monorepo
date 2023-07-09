// @ts-check

/**
 * Map headings array to TOC tree
 *
 * @param {import('../types').HeadingsItem[]} headings
 * @param {import('../types').TOCTree} tree
 * @param currentLevel
 * @returns {import('../types').TOCTree} TOC tree
 *
 * @example
 * ```js
 * mapHeadingsToTOC([{ level: 2, value: 'Заголовок верхнего уровня' }, { level: 3, value: 'Вложенный заголовок'}, { level: 2, value: 'Заголовок верхнего уровня 2' }, { level: 3, value: 'Вложенный заголовок 1' }, {level: 4, value: 'Вложенный заголовок во вложенный заголовок 1'}])
 * // [{level: 2, value: 'Заголовок верхнего уровня', children: [{level: 3, value: 'Вложенный заголовок'}]}, {level: 2, value: 'Заголовок верхнего уровня 2', children: [{depth: 3, value: 'Вложенный заголовок 1', children: [{depth: 4, value: 'Вложенный заголовок во вложенный заголовок 1'}] }]}]
 * ```
 */
export function mapHeadingsToTOC(headings, tree = [], currentLevel = 2) {
  while (headings.length > 0) {
    /**
     * @type {import('../types').TOCTreeItem}
     */
    const heading = headings[0]
    if (heading.level < currentLevel) {
      return tree
    }
    heading.children = []
    if (heading.level === currentLevel) {
      headings.shift()
      tree.push({ ...heading, children: mapHeadingsToTOC(headings, heading.children, currentLevel + 1) })
    }
    if (heading.level > currentLevel) {
      mapHeadingsToTOC(headings, heading.children, currentLevel + 1)
    }
  }

  return tree
}
