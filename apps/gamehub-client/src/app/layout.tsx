import type { ReactNode } from 'react'
import { Providers } from './Providers'
import { Footer } from '../layouts/main/Footer'
import { Header } from '../layouts/main/Header'
import { Main } from '../layouts/main/Main'

export const metadata = {
  title: 'GameHub',
  description: 'MemeBattle',
  manifest: '/site.webmanifest',
  other: {
    'emotion-insertion-point': ' ',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <html lang="en">
        <body>
          <Header />
          <Main>{children}</Main>
          <Footer />
        </body>
      </html>
    </Providers>
  )
}
