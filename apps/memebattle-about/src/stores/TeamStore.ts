/* eslint-disable @typescript-eslint/no-empty-interface */
import { types, flow, Instance, SnapshotIn, SnapshotOut } from 'mobx-state-tree'
import { socialNetworkTypesMap } from '🏠/utils/socialNetworks'

const SocialNetwork = types.model({
  type: types.enumeration(Object.keys(socialNetworkTypesMap)),
  link: types.string,
})

export const Teammate = types.model({
  id: types.number,
  username: types.string,
  name: types.string,
  photoUrl: types.string,
  socialNetworks: types.optional(types.array(SocialNetwork), []),
})

export interface Teammate extends Instance<typeof Teammate> {}
export interface TeammateSnapshotIn extends SnapshotIn<typeof Teammate> {}
export interface TeammateSnapshotOut extends SnapshotOut<typeof Teammate> {}

const teammatesMock = [
  {
    id: 1,
    name: 'Artem Zverev',
    username: 'themezv',
    photoUrl: 'https://pbs.twimg.com/profile_images/963100518695436290/26geOJ79.jpg',
    socialNetworks: [
      { type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.TWITTER, link: 'https://twitter.com/ThemeZV' },
      { type: socialNetworkTypesMap.FB, link: 'https://www.facebook.com/ThemeZV' },
      { type: socialNetworkTypesMap.INST, link: 'https://www.instagram.com/artem_zverev.9/' },
      { type: socialNetworkTypesMap.LINKEDIN, link: 'http://linkedin.com/in/themezv' },
      { type: socialNetworkTypesMap.TG, link: 'https://t.me/ThemeZV' },
    ],
  },
  {
    id: 2,
    name: 'Stepan Dyubin',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c628324/v628324979/342e/d8JZtp7NndQ.jpg',
    socialNetworks: [
      { type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.TWITTER, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.FB, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.INST, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.LINKEDIN, link: 'https://vk.com/themezv' },
    ],
  },
  {
    id: 3,
    name: 'Sevastyan Zhukov',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c847122/v847122454/7dc11/h1pM6hGQvHw.jpg?ava=1',
    socialNetworks: [
      { type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.TWITTER, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.FB, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.INST, link: 'https://vk.com/themezv' },
    ],
  },
  {
    id: 4,
    name: 'Vasiliy Kuzenkov',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c841034/v841034131/83942/FUnxkwSt-Cw.jpg?ava=1',
    socialNetworks: [
      { type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.TWITTER, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.FB, link: 'https://vk.com/themezv' },
    ],
  },
  {
    id: 5,
    name: 'Stepan Dyubin',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c628324/v628324979/342e/d8JZtp7NndQ.jpg',
    socialNetworks: [
      { type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.TWITTER, link: 'https://vk.com/themezv' },
    ],
  },
  {
    id: 6,
    name: 'Stepan Dyubin',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c628324/v628324979/342e/d8JZtp7NndQ.jpg',
    socialNetworks: [{ type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' }],
  },
  {
    id: 7,
    name: 'Stepan Dyubin',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c628324/v628324979/342e/d8JZtp7NndQ.jpg',
    socialNetworks: [
      { type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.TWITTER, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.FB, link: 'https://vk.com/themezv' },
    ],
  },
  {
    id: 8,
    name: 'Stepan Dyubin',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c628324/v628324979/342e/d8JZtp7NndQ.jpg',
    socialNetworks: [
      { type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' },
      { type: socialNetworkTypesMap.TWITTER, link: 'https://vk.com/themezv' },
    ],
  },
  {
    id: 9,
    name: 'Stepan Dyubin',
    username: 'themezv',
    photoUrl: 'https://pp.userapi.com/c628324/v628324979/342e/d8JZtp7NndQ.jpg',
    socialNetworks: [{ type: socialNetworkTypesMap.VK, link: 'https://vk.com/themezv' }],
  },
]

const TeamService = {
  getTeammates: async () => new Promise(resolve => resolve(teammatesMock)),
}

export const TeamStore = types.model({ teammates: types.array(Teammate) }).actions(self => ({
  loadTeam: flow(function*() {
    self.teammates = yield TeamService.getTeammates()
  }),
}))
