import type { Language } from '@/i18n/i18n.settings'

export function formatDate(dateString: string, locale: Language) {
  return new Intl.DateTimeFormat(locale).format(new Date(dateString))
}
