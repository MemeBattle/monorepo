import React from 'react'
import { observer } from 'mobx-react-lite'
import { Store } from '🏠/stores'
import { Teammate as ITeammate } from '🏠/stores/TeamStore'
import { useStore } from '🏠/hooks'
import { Box, Link } from '🏠/components/base'
import { Teammate } from '🏠/components/team'
import styles from './TeamList.module.scss'

const selectTeammates = (store: Store) => store.team.teammates

export const TeamList: React.FC = observer(() => {
  const teammates = useStore(selectTeammates)
  return (
    <Box className={styles.teamList}>
      {teammates.map((teammate: ITeammate) => (
        <Link
          className={styles.teamListItem}
          key={teammate.id}
          href={{ pathname: '/teammate', query: { username: teammate.username } }}
          as={`/teammate/${teammate.username}`}
          is="div"
        >
          <Teammate teammate={teammate} />
        </Link>
      ))}
    </Box>
  )
})
