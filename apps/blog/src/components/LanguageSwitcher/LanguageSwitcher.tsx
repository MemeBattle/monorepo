import type { Language } from '../../i18n/i18n.settings'
import { languages } from '../../i18n/i18n.settings'
import { useTranslation } from '../../i18n'
import { Dropdown } from './Dropdown'
import { Suspense } from 'react'

interface LanguageSwitcherProps {
  locale: Language
}

function LanguageSwitcherTrigger({ content }: { content: string }) {
  return (
    <button className="group flex space-x-2 items-center p-1">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="19" fill="none">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M20.75 18.25 15.5 7.75l-5.25 10.5m1.5-3h7.5m-9-12a9 9 0 0 1-9 9m3.513-6a9.004 9.004 0 0 0 8.486 5.997M1.25 3.25h12M7.25 1v2.25"
        />
      </svg>
      <span>{content}</span>
      <svg className="group-aria-expanded:rotate-180 transition-transform" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none">
        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.5 9 12 16.5 4.5 9" />
      </svg>
    </button>
  )
}

export async function LanguageSwitcher({ locale }: LanguageSwitcherProps) {
  const { t } = await useTranslation(locale)

  return (
    <nav className="text-white ml-auto mr-10 md:mr-20">
      <Suspense fallback={<LanguageSwitcherTrigger content={t(`header.${locale}`)} />}>
        <Dropdown currentLanguage={locale} availableLanguages={languages.map(language => ({ language, label: t(`header.${language}`) }))}>
          <LanguageSwitcherTrigger content={t(`header.${locale}`)} />
        </Dropdown>
      </Suspense>
    </nav>
  )
}
