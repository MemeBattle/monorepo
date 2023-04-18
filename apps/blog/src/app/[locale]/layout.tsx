import type { Metadata } from 'next'
import localFont from 'next/font/local'
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
      <body className="flex flex-col items-center">{children}</body>
    </html>
  )
}
