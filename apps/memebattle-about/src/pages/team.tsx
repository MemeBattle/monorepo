import React from 'react'
import { observer } from 'mobx-react-lite'
import { TeamList, LogoSection } from '🏠/components/team'
import { ENFC } from '🏠/types'

const Team: ENFC = () => {
  return (
    <>
      <LogoSection />
      <TeamList />
    </>
  )
}

Team.getInitialProps = async ({ store }) => {
  await store.team.loadTeam()
}

export default observer(Team)
