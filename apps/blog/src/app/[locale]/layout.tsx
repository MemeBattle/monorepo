import './globals.css'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { dir } from 'i18next'
import type { Language } from '@/i18n'
import { languages, useTranslation } from '@/i18n'
import { generateFullUrl } from '@/utils'
import { Amplitude } from '@/components/Amplitude'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Footer } from '@/components/Footer'

type RootLayoutParams = { locale: Language }

export async function generateMetadata({ params }: { params: RootLayoutParams }): Promise<Metadata> {
  // useTranslation on server isn't react hook
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { t } = await useTranslation(params.locale)

  return {
    metadataBase: new URL(generateFullUrl()),
    title: {
      default: t('main.title'),
      template: `%s | ${t('main.title')}`,
    },
    description: t('main.description'),
    manifest: '/site.webmanifest',
    generator: 'Next.js',
    applicationName: t('main.applicationName'),
    openGraph: {
      siteName: t('main.applicationName'),
      title: t('main.title'),
      description: t('main.description'),
      type: 'website',
      locale: params.locale,
      alternateLocale: [...languages],
      url: generateFullUrl(),
    },
  }
}

export async function generateStaticParams() {
  return languages.map(locale => ({ locale }))
}

const gravityFont = localFont({
  variable: '--font-gravity',
  src: [
    {
      path: '../../fonts/gravity/Gravity-UltraLight.otf',
      style: 'normal',
      weight: '200',
    },
    {
      path: '../../fonts/gravity/Gravity-UltraLightItalic.otf',
      style: 'italic',
      weight: '200',
    },
    {
      path: '../../fonts/gravity/Gravity-Light.otf',
      style: 'normal',
      weight: '300',
    },
    {
      path: '../../fonts/gravity/Gravity-LightItalic.otf',
      style: 'italic',
      weight: '300',
    },
    {
      path: '../../fonts/gravity/Gravity-Book.otf',
      style: 'normal',
      weight: '400',
    },
    {
      path: '../../fonts/gravity/Gravity-BookItalic.otf',
      style: 'italic',
      weight: '400',
    },
    {
      path: '../../fonts/gravity/Gravity-Regular.otf',
      style: 'normal',
      weight: '500',
    },
    {
      path: '../../fonts/gravity/Gravity-Italic.otf',
      style: 'italic',
      weight: '500',
    },
    {
      path: '../../fonts/gravity/Gravity-Bold.otf',
      style: 'normal',
      weight: '700',
    },
    {
      path: '../../fonts/gravity/Gravity-BoldItalic.otf',
      style: 'italic',
      weight: '700',
    },
  ],
})

const archerusFeralFont = localFont({
  variable: '--font-archerusFeral',
  src: [
    {
      path: '../../fonts/horizon-type-acherusferal/AcherusFeral-Bold.otf',
      weight: '700',
    },
    {
      path: '../../fonts/horizon-type-acherusferal/AcherusFeral-Light.otf',
      weight: '300',
    },
  ],
})

export default function RootLayout({ children, params: { locale } }: { children: React.ReactNode; params: RootLayoutParams }) {
  return (
    <html lang={locale} dir={dir(locale)} className={`${gravityFont.variable} ${archerusFeralFont.variable}`}>
      <body className="flex flex-col items-center min-h-screen">
        <header className="h-18 w-full bg-gray-600 flex items-center">
          {/* @ts-expect-error React Server components */}
          <LanguageSwitcher locale={locale} />
        </header>
        {children}
        {/** @ts-expect-error React Server components  */}
        <Footer locale={locale} />
        <Amplitude />
      </body>
    </html>
  )
}
