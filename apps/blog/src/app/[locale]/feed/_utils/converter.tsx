import { ServerMdx } from '@/components/Mdx'

export const convertMarkdownToHtml = async (code: string): Promise<string> => {
  /**************************************
  ReactDOMServer dynamic import is used to exclude a ReactServerComponentsError:
    ReactServerComponentsError:

    You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
    Learn more: https://nextjs.org/docs/getting-started/react-essentials

  See https://github.com/vercel/next.js/issues/43810#issuecomment-1341136525
  **************************************/
  const ReactDOMServer = (await import('react-dom/server')).default

  const html = ReactDOMServer.renderToStaticMarkup(<ServerMdx code={code} />)

  return html
}
