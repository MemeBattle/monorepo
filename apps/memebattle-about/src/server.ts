import express from 'express'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev })
const handle = app.getRequestHandler()
const server = express()

const run = async () => {
  try {
    await app.prepare()

    server.get('/teammate/:username', (req, res) => {
      const actualPage = '/teammate:username'
      const queryParams = { username: req.params.username }
      app.render(req, res, actualPage, queryParams)
    })

    server.get('*', (req, res) => handle(req, res))

    server.listen(1488, (err: any) => {
      if (err) {
        throw err
      }
      console.log('> Ready on :1488')
    })
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

run()
