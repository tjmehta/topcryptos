import AbstractApp from 'abstract-app'
import Server from './server'

class App extends AbstractApp {
  private server = new Server()

  async _start() {
    await this.server.start()
  }

  async _stop() {
    await this.server.stop()
  }
}

new App({
  logger: console,
  stopTimeout: 5 * 1000,
}).start()
