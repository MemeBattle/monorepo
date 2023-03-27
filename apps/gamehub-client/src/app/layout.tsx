import type { ReactNode } from 'react'
import { Providers } from './Providers'
import { Footer } from '../layouts/main/Footer'
import { Header } from '../layouts/main/Header'
import { Main } from '../layouts/main/Main'

export const metadata = {
  title: 'GameHub',
  description: 'MemeBattle',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <html lang="en">
        <head>
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
          <link rel="manifest" href="/site.webmanifest" />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />
          <meta name="msapplication-TileColor" content="#da532c" />
          <meta name="emotion-insertion-point" content="" />
        </head>
        <body>
          <Header />
          <Main>{children}</Main>
          <Footer />
        </body>
      </html>
    </Providers>
  )
}
