export function Blockquote(props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
  const quoteClass = 'before:content-quote before:absolute before:left-[0]'
  return <blockquote className={quoteClass} {...props} />
}
