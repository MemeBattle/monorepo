import { vk, twitter, fb, instagram, linkedin, behance, tg } from '🏠/assets/icons/social-networks'

export const socialNetworkTypesMap = {
  VK: 'VK',
  FB: 'FB',
  INST: 'INST',
  TG: 'TG',
  TWITTER: 'TWITTER',
  LINKEDIN: 'LINKEDIN',
  BEHANCE: 'BEHANCE',
}

export const socialNetworkLogoByType = {
  [socialNetworkTypesMap.VK]: vk,
  [socialNetworkTypesMap.FB]: fb,
  [socialNetworkTypesMap.INST]: instagram,
  [socialNetworkTypesMap.TG]: tg,
  [socialNetworkTypesMap.TWITTER]: twitter,
  [socialNetworkTypesMap.LINKEDIN]: linkedin,
  [socialNetworkTypesMap.BEHANCE]: behance,
}
