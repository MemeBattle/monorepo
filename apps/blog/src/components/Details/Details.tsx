export function Details({ children }: React.PropsWithChildren) {
  return <details className="rounded-lg shadow cursor-pointer overflow-hidden hover:shadow-lg not-prose group">{children}</details>
}
