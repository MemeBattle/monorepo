import user1 from './assets/u1.svg'
import user2 from './assets/u2.svg'
import user3 from './assets/u3.svg'
import user4 from './assets/u4.svg'
import user5 from './assets/u5.svg'
import user6 from './assets/u6.svg'
import user7 from './assets/u7.svg'
import user8 from './assets/u8.svg'

export const userAvatars = [user1, user2, user3, user4, user5, user6, user7, user8]

/**
 This Function do a random Avatar of Array.
  */
export function getRandomAvatar() {
  return userAvatars[Math.floor(Math.random() * userAvatars.length)]
}
