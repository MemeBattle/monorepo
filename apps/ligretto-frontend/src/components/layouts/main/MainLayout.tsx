import React from 'react'
import { Background } from './Background'

import { BaseLayout } from '../base/BaseLayout'

export const MainLayout: React.FC = ({ children }) => (
  <BaseLayout position="relative" overflow="hidden">
    <Background>{children}</Background>
  </BaseLayout>
)
