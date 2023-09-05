'use client'

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import type { Language } from '@/i18n/i18n.settings'

export function Breadcrumbs({ locale, translates }: { locale: Language; translates: { mainPage: string; posts: string } }) {
  const segment = useSelectedLayoutSegment()

  return (
    <nav className="container px-1 my-10" aria-label="Breadcrumb">
      <ul className="inline-flex space-x-5 list-disc text-sm [&>*]:opacity-40 [&>*:last-child]:opacity-80">
        <li className="list-none">
          <Link href={`/${locale}`}>{translates.mainPage}</Link>
        </li>
        <li aria-current={segment ? undefined : 'page'}>
          <Link href={`/${locale}/posts`}>{translates.posts}</Link>
        </li>
        {segment ? <li aria-current="page">{segment}</li> : null}
      </ul>
    </nav>
  )
}
