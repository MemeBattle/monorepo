import type { PropsWithChildren } from 'react'
import React from 'react'
import { Background } from './Background'

import { BaseLayout } from '../base/BaseLayout'

export const MainLayout: React.FC<React.PropsWithChildren<PropsWithChildren>> = ({ children }) => (
  <BaseLayout position="relative" overflow="hidden">
    <Background>{children}</Background>
  </BaseLayout>
)
