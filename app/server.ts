import { IncomingMessage, ServerResponse } from 'http'
import { UrlWithParsedQuery, parse } from 'url'

import AbstractServer from 'abstract-http-server'
import NextServer from 'next/dist/next-server/server/next-server'
import next from 'next'
import qs from 'querystring'

export default class Server extends AbstractServer {
  private nextServer: NextServer
  private nextRequestHandler: (
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl?: UrlWithParsedQuery | undefined,
  ) => Promise<void>

  async _start() {
    if (this.nextServer == null) {
      this.nextServer = next({ dev: process.env.NODE_ENV !== 'production' })
      await this.nextServer.prepare()
      this.nextRequestHandler = this.nextServer.getRequestHandler()
    }
    return super._start({ port: 3000 })
  }

  handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    if (/api\/rankings\/daily/.test(req.url)) {
      const queryIndex = req.url.indexOf('?')
      let query = {}
      if (~queryIndex) {
        query = qs.parse(req.url.slice(queryIndex + 1))
      }
      const daily = require('../pages/api/rankings/daily').default
      try {
        await daily(
          {
            query,
          },
          {
            status: (status: number) => {
              res.statusCode = status
              return {
                json: (json: {}) => {
                  const str = JSON.stringify(json)
                  res.write(str)
                  res.end()
                },
              }
            },
          },
        )
      } catch (err) {
        res.statusCode = 500
        res.write('something bad happenned')
        res.end()
      }
      return
    }
    this.nextRequestHandler(req, res)
  }
}
