import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Breadcrumbs } from '../../../components/Breadcrumbs'
import type { Language } from '../../../i18n/i18n.settings'
import { useTranslation } from '../../../i18n'
import { generateFullUrl } from '../../../utils/generateFullUrl'
import memebattleLogo from '../../../assets/memebattle-logo.svg'

export async function generateMetadata({ params }: { params: { locale: Language } }): Promise<Metadata> {
  // useTranslation on server isn't react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = await useTranslation(params.locale, 'posts')

  return {
    openGraph: {
      url: generateFullUrl(`/${params.locale}/posts`),
      description: t('description'),
      title: t('title'),
      images: [generateFullUrl(memebattleLogo.src)],
    },
  }
}

interface PostsLayoutProps {
  children: ReactNode
  params: { locale: Language }
}
export default async function PostsLayout({ children, params: { locale } }: PostsLayoutProps) {
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
