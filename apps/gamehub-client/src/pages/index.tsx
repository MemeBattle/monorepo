import { Button } from '@memebattle/ui'

import type { NextPageWithLayout } from '../types'

import { MainLayout } from '../layouts/main'
import type { ReactElement } from 'react'

const Home: NextPageWithLayout = () => (
  <div>
    <Button>Hello!</Button>
  </div>
)

Home.getLayout = (page: ReactElement) => <MainLayout>{page}</MainLayout>

export default Home
