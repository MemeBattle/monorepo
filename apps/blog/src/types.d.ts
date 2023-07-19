export type HeadingsItem = {
  level: number
  value: string
  slug: string
}

export type TOCTreeItem = HeadingsItem & {
  children?: TOCTreeItem[]
}

export type TOCTree = TOCTreeItem[]
