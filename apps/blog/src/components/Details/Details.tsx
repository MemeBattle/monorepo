export function Details({ children }: React.PropsWithChildren) {
  return <details className="rounded-lg shadow cursor-pointer hover:shadow-lg not-prose group">{children}</details>
}
