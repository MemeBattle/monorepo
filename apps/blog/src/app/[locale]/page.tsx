import { redirect } from 'next/navigation'
import type { Language } from '@/i18n/i18n.settings'

export default async function BlogPage(props: { params: Promise<{ locale: Language }> }) {
  const params = await props.params

  return redirect(`/${params.locale}/posts`)
}
