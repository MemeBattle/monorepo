import type { DocumentContext } from 'next/document'
import Document, { Html, Head, Main, NextScript } from 'next/document'
import createEmotionServer from '@emotion/server/create-instance'
import { createEmotionCache } from '../utils/createEmotionCache'

class MyDocument extends Document<{ emotionStyleTags?: string[] }> {
  static async getInitialProps(ctx: DocumentContext) {
    const originalRenderPage = ctx.renderPage

    const cache = createEmotionCache()
    const { extractCriticalToChunks } = createEmotionServer(cache)

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: App =>
          function EnhanceApp(props) {
            // @ts-expect-error emotionCache does not exist in AppTypes
            return <App emotionCache={cache} {...props} />
          },
      })

    const initialProps = await Document.getInitialProps(ctx)
    // This is important. It prevents Emotion to render invalid HTML.
    // See https://github.com/mui/material-ui/issues/26561#issuecomment-855286153
    const emotionStyles = extractCriticalToChunks(initialProps.html)
    const emotionStyleTags = emotionStyles.styles.map(style => (
      <style data-emotion={`${style.key} ${style.ids.join(' ')}`} key={style.key} dangerouslySetInnerHTML={{ __html: style.css }} />
    ))

    return {
      ...initialProps,
      emotionStyleTags,
    }
  }

  render() {
    return (
      <Html lang="en">
        <Head>{this.props.emotionStyleTags}</Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
