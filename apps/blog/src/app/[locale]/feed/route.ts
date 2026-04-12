import type { Language } from '@/i18n/i18n.settings'
import { createChannelInfo } from './_utils/channelInfoCreator'
import { buildAtomFeed } from './_utils/feedBuilder'

export async function GET(_request: Request, props: { params: Promise<{ locale: Language }> }) {
  const params = await props.params;
  const channelInfo = await createChannelInfo(params.locale)
  const atomFeed = buildAtomFeed(channelInfo)

  return new Response(atomFeed, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  })
}
