// import { unified } from 'unified'
// import remarkParse from 'remark-parse'
// import remarkRehype from 'remark-rehype'
// import rehypeSanitize from 'rehype-sanitize'
// import rehypeStringify from 'rehype-stringify'
import { ServerMdx } from '@/components/Mdx'

// TODO: see https://github.com/unifiedjs/unified/issues/227 before update the dependencies;
export const convertMarkdownToHtml = async (code: string): Promise<string> => {
  /**************************************
  Использую динамический импорт ReactDOMServer, чтобы убрать ошибку:

  ReactServerComponentsError:

  You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
  Learn more: https://nextjs.org/docs/getting-started/react-essentials

  Взял решение отсюда https://github.com/vercel/next.js/issues/43810#issuecomment-1341136525

  **************************************/
  const ReactDOMServer = (await import('react-dom/server')).default

  const html = ReactDOMServer.renderToStaticMarkup(<ServerMdx code={code} />)

  // const file = await unified()
  //   .use(remarkParse) // Convert into markdown AST
  //   .use(remarkRehype) // Transform to HTML AST
  //   .use(rehypeSanitize) // Sanitize HTML input
  //   .use(rehypeStringify) // Convert AST into serialized HTML
  //   .process(content)

  return String(html)
}
