import './globals.css'

export const metadata = {
  title: 'MemeBattle blog',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body className="flex flex-col items-center">{children}</body>
    </html>
  )
}
