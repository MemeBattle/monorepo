import type { Metadata } from 'next'
import { dir } from 'i18next'
import './globals.css'
import type { Language } from '../../i18n/i18n.settings'
import { languages } from '../../i18n/i18n.settings'
import { useTranslation } from '../../i18n'

type RootLayoutParams = { locale: Language }

export async function generateMetadata({ params }: { params: RootLayoutParams }): Promise<Metadata> {
  // useTranslation on server isn't react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = await useTranslation(params.locale)

  return {
    title: t('main.title'),
  }
}

export async function generateStaticParams() {
  return languages.map(locale => ({ locale }))
}

export default function RootLayout({ children, params: { locale } }: { children: React.ReactNode; params: RootLayoutParams }) {
  return (
    <html lang={locale} dir={dir(locale)}>
      <body className="flex flex-col items-center">{children}</body>
    </html>
  )
}
