import ApiClient from 'simple-api-client'

class Okex extends ApiClient {
  constructor() {
    super('https://okex.com/api/v5', (url, init) => {
      return { ...init }
    })
  }
}
