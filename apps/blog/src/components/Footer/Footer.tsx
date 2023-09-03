import Image from 'next/image'

import gitHubLogo from './GitHub_Logo_White.png'
import type { Language } from '@/i18n/i18n.settings'
import { useTranslation } from '@/i18n'
import memebattleLogo from '../../assets/memebattle-logo.svg'

export async function Footer({ locale }: { locale: Language }) {
  const { t } = await useTranslation(locale)

  return (
    <footer className="sm:h-32 mt-auto w-full pt-5">
      <div className="bg-gray-600 grid grid-cols-1 grid-rows-3 sm:grid-cols-3 sm:grid-rows-1 h-full">
        <div className="text-gray-200 p-5 text-center sm:text-left">
          <span className="font-light text-xs">{t('footer.projects.title')}</span>
          <ul className="text-sm font-bold list-disc list-inside">
            <li>
              <a href="https://mems.fun">{t('footer.projects.gameHub')}</a>
            </li>
            <li>
              <a href="https://ligretto.app">{t('footer.projects.ligretto')}</a>
            </li>
          </ul>
        </div>
        <div className="flex flex-1 justify-center items-center h-full">
          <a className="max-h-fit" href="https://github.com/MemeBattle/monorepo">
            <Image width="150" alt="GitHub" src={gitHubLogo} />
          </a>
        </div>
        <div className="flex sm:mr-5 flex-1 items-center h-full justify-self-center sm:justify-self-end justify-end">
          <Image width="70" alt="MemeBattle logo" src={memebattleLogo} />
        </div>
      </div>
    </footer>
  )
}
