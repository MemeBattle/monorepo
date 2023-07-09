import clsx from 'clsx'
import type { TOCTree, TOCTreeItem } from '../../types'
import { useTranslation } from '../../i18n'
import type { Language } from '../../i18n/i18n.settings'

interface TOCProps {
  toc: TOCTree
  locale: Language
}
export async function TOC({ toc, locale }: TOCProps) {
  const { t } = await useTranslation(locale, 'post')

  return (
    <nav className="rounded-lg shadow p-6 w-full">
      <header className="font-semibold text-gray-700">{t('tocHeader')}</header>
      <ul className="list-inside list-dash font-light text-gray-700 mt-2 marker:tracking-listDash">
        {toc.map(heading => (
          <HeadingsTree key={heading.value} item={heading} isRoot />
        ))}
      </ul>
    </nav>
  )
}

function HeadingsTree({ item, isRoot }: { item: TOCTreeItem; isRoot?: boolean }) {
  return (
    <li className={clsx({ 'pl-6': !isRoot })}>
      <a className="hover:underline" href={`#${item.slug}`}>
        {item.value}
      </a>
      {item.children?.map(itemChildren => (
        <ul key={itemChildren.value} className="list-inside list-dash">
          <HeadingsTree item={itemChildren} isRoot={false} />
        </ul>
      )) ?? null}
    </li>
  )
}
