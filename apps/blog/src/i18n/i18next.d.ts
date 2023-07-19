import 'i18next'
import type { defaultNS } from './i18n.settings'
import type commonNS from './locales/en/common.json'
import type postsNs from './locales/en/posts.json'
import type postNs from './locales/en/post.json'

declare module 'i18next' {
  // Extend CustomTypeOptions
  interface CustomTypeOptions {
    // custom namespace type, if you changed it
    defaultNS: typeof defaultNS
    // custom resources type
    resources: {
      common: typeof commonNS
      posts: typeof postsNs
      post: typeof postNs
    }
  }
}
