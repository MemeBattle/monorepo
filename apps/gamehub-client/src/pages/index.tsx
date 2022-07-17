import type { NextPageWithLayout } from '../types'

import { MainLayout } from '../layouts/main'
import type { ReactElement } from 'react'

import { GamesBanner } from '../components/GamesBanner'

const Home: NextPageWithLayout = () => <GamesBanner />

Home.getLayout = (page: ReactElement) => <MainLayout>{page}</MainLayout>

export default Home
