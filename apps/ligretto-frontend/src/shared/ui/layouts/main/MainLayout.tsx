import type { PropsWithChildren } from 'react'
import React from 'react'
import { Background } from './Background'

import { BaseLayout } from '../base/BaseLayout'

export const MainLayout: React.FC<PropsWithChildren> = ({ children }) => (
  <BaseLayout position="relative">
    <Background>{children}</Background>
  </BaseLayout>
)
