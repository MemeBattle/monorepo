export function Blockquote(props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
  return (
    <blockquote
      className="relative border-none font-semibold not-italic pl-[2.5em] lg:pl-[2em] before:content-quote before:absolute before:left-[0]"
      {...props}
    />
  )
}
