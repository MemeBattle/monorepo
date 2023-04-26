import { Breadcrumbs } from '../../../components/Breadcrumbs'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import type { Language } from '../../../i18n/i18n.settings'
import { useTranslation } from '../../../i18n'

export default async function PostsLayout({ children, params: { locale } }: { children: ReactNode; params: { locale: Language } }) {
  const { t } = await useTranslation(locale, 'posts')

  return (
    <>
      <Suspense>
        <Breadcrumbs locale={locale} translates={{ mainPage: t('breadcrumbs.mainPage'), posts: t('breadcrumbs.posts') }} />
      </Suspense>
      {children}
    </>
  )
}
