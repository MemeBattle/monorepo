import type { ReactNode } from 'react'
import React, { createContext } from 'react'
import { Typography } from '@memebattle/ligretto-ui'
import { t } from '../../utils/i18n'

export interface AppContextValue {
  Header: ReactNode
  token: string
}
export const AppContext = createContext<AppContextValue>({
  Header: (
    <Typography align="center" variant="h1">
      {t.header}
    </Typography>
  ),
  token: '',
})
