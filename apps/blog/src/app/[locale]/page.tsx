import { redirect } from 'next/navigation'
import type { Language } from '@/i18n'

export default function BlogPage({ params: { locale } }: { params: { locale: Language } }) {
  return redirect(`/${locale}/posts`)
}
