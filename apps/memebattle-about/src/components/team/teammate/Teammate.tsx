import React from 'react'
import classNames from 'classnames'
import { Box, Text, Image } from '🏠/components/base'
import { CircleImage } from '🏠/components/common'
import { Teammate as ITeammate } from '🏠/stores/TeamStore'
import { socialNetworkLogoByType } from '🏠/utils/socialNetworks'
import { useInView, useMedia } from '🏠/hooks'
import styles from './Teammate.module.scss'

export interface Props {
  teammate: ITeammate
}

export const Teammate: React.FC<Props> = ({ teammate }) => {
  const [ref, inView] = useInView({
    threshold: 0.95,
    rootMargin: '-150px 0px -150px 0px',
  })

  const isMobile = useMedia('(min-width: 320px) and (max-width: 480px)')

  return (
    <Box className={classNames(styles.teammate, { [styles.teammateInView]: inView && isMobile })} ref={ref}>
      <Box className={styles.photoWrapper}>
        <Box className={styles.socialNetworks}>
          {teammate.socialNetworks.map(({ type, link }, index, { length }) => (
            <a key={index} href={link}>
              <Box className={classNames(styles.iconWrapper, styles[`iconWrapper-${index}-${length}`])}>
                <Image src={socialNetworkLogoByType[type]} alt={`${teammate.name} ${type}`} className={styles.icon} />
              </Box>
            </a>
          ))}
        </Box>
        <CircleImage src={teammate.photoUrl} className={styles.photo} />
      </Box>
      <Text is="p" className={styles.name}>
        {teammate.name}
      </Text>
    </Box>
  )
}
