import type { CustomTypeOptions } from 'i18next'
import { createInstance } from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next/initReactI18next'
import type { Language } from './i18n.settings'
import { getOptions, defaultNS } from './i18n.settings'

enum AppSide {
  Client,
  Server,
}

const i18nextFactory = async (appSide: AppSide, lng: string, ns?: string) => {
  const i18nInstance = createInstance()
  await i18nInstance
    .use(resourcesToBackend((language: string, namespace: string) => import(`./locales/${language}/${namespace}.json`)))
    .init(getOptions(lng, ns))

  if (appSide === AppSide.Client) {
    await i18nInstance.use(initReactI18next)
  }

  return i18nInstance
}

export async function useTranslation(lng: Language, ns: keyof CustomTypeOptions['resources'] = defaultNS) {
  const i18nextInstance = await i18nextFactory(AppSide.Client, lng, ns)

  return {
    t: i18nextInstance.getFixedT(lng, ns),
    i18n: i18nextInstance,
  }
}

export async function getTranslation(lng: string, ns: keyof CustomTypeOptions['resources'] = defaultNS) {
  const i18nextInstance = await i18nextFactory(AppSide.Server, lng, ns)

  return {
    t: i18nextInstance.getFixedT(lng, ns),
    i18n: i18nextInstance,
  }
}
