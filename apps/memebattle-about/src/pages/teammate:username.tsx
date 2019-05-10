import React from 'react'
import { withRouter, SingletonRouter } from 'next/router'
import get from 'lodash/get'
import { observer } from 'mobx-react-lite'
import { Box } from '🏠/components/base'
import { ENFC } from '🏠/types'

interface Props {
  router: SingletonRouter
}

const Teammate: ENFC<Props> = ({ router }) => <Box>Teammate: {get(router, 'query.username')}</Box>

Teammate.getInitialProps = async ({ store }) => {
  await store.team.loadTeam()
}

export default withRouter(observer(Teammate))
