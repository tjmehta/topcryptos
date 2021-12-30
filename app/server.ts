import { IncomingMessage, ServerResponse } from 'http'
import { UrlWithParsedQuery, parse } from 'url'

import AbstractServer from 'abstract-http-server'
import { NextServer } from 'next/dist/server/next'
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
    this.nextRequestHandler(req, res)
  }
}
