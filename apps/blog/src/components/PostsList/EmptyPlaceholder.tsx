import Image from 'next/image'
import emptyImage from './empty_image.svg'
import { Trans } from 'react-i18next/TransWithoutContext'
import { useTranslation } from '../../i18n'
import type { Language } from '../../i18n/i18n.settings'
export async function EmptyPlaceholder({ language }: { language: Language }) {
  const { t } = await useTranslation(language, 'posts')

  return (
    <section className="flex flex-col items-center shadow rounded-lg p-10">
      <Trans key="emptyListMessage" t={t} components={{ h1: <h1 className="font-bold text-2xl my-4" /> }}>
        {t('emptyListPlaceholderMessage')}
      </Trans>
      <Image className="mt-10" priority src={emptyImage} alt={t('emptyListPlaceholderImageAlt')}></Image>
    </section>
  )
}
