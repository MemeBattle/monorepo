import { Feed } from 'feed'
import type { ChannelInfo } from './channelInfoCreator'

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
