import { Feed } from 'feed'
import type { ChannelInfo } from './channelInfoCreator'

/**
 * Build a feed document in the atom format: {@link https://www.ietf.org/rfc/rfc4287.txt}.
 *
 * @param channelInfo - The object with blog data and metadata for feed creation.
 * @returns Feed string in the atom format
 */
export const buildAtomFeed = (channelInfo: ChannelInfo): string => {
  const feed = new Feed({
    title: channelInfo.title,
    description: channelInfo.description,
    id: channelInfo.url,
    link: channelInfo.url,
    copyright: `All rights reserved 2023, ${channelInfo.title}`,
    updated: new Date(channelInfo.updatedAt),
    feedLinks: {
      atom: channelInfo.atomUrl,
    },
  })

  channelInfo.posts.forEach(post => {
    feed.addItem({
      title: post.title,
      link: post.url,
      id: post.url,
      published: new Date(post.publishedAt),
      date: new Date(post.publishedAt),
      description: post.summary,
      content: post.content,
      author: [
        {
          name: post.author,
        },
      ],
    })
  })

  return feed.atom1()
}
