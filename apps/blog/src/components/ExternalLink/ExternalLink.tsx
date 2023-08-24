export function ExternalLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const linkClass = 'text-externalLink font-semibold no-underline after:content-externalLink after:ml-4'
  return <a className={linkClass} {...props} />
}
