// Exchange data module for cryptocurrency exchange availability filtering

export type ExchangeInfo = {
  id: string
  name: string
  url: string
  type: 'centralized' | 'decentralized'
}

export type CryptoExchangeMapping = {
  [cryptoSymbol: string]: string[] // Array of exchange IDs where this crypto is available
}

// Popular exchanges data
export const EXCHANGES: ExchangeInfo[] = [
  {
    id: 'coinbase',
    name: 'Coinbase',
    url: 'https://coinbase.com',
    type: 'centralized'
  },
  {
    id: 'binance',
    name: 'Binance',
    url: 'https://binance.com',
    type: 'centralized'
  },
  {
    id: 'kraken',
    name: 'Kraken',
    url: 'https://kraken.com',
    type: 'centralized'
  },
  {
    id: 'uniswap',
    name: 'Uniswap',
    url: 'https://uniswap.org',
    type: 'decentralized'
  },
  {
    id: 'sushiswap',
    name: 'SushiSwap',
    url: 'https://sushi.com',
    type: 'decentralized'
  },
  {
    id: 'pancakeswap',
    name: 'PancakeSwap',
    url: 'https://pancakeswap.finance',
    type: 'decentralized'
  },
  {
    id: 'ftx',
    name: 'FTX',
    url: 'https://ftx.com',
    type: 'centralized'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.com',
    type: 'centralized'
  },
  {
    id: 'kucoin',
    name: 'KuCoin',
    url: 'https://kucoin.com',
    type: 'centralized'
  },
  {
    id: 'bitfinex',
    name: 'Bitfinex',
    url: 'https://bitfinex.com',
    type: 'centralized'
  }
]

// Mapping of crypto symbols to exchanges where they're commonly available
// This is a simplified mapping for demonstration - in a real app you'd fetch this from APIs
export const CRYPTO_EXCHANGE_MAPPING: CryptoExchangeMapping = {
  // Major cryptocurrencies available on most exchanges
  'BTC': ['coinbase', 'binance', 'kraken', 'ftx', 'gemini', 'kucoin', 'bitfinex'],
  'ETH': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini', 'kucoin', 'bitfinex'],
  'BNB': ['binance', 'pancakeswap', 'kucoin', 'bitfinex'],
  'ADA': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'SOL': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin'],
  'XRP': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'DOGE': ['coinbase', 'binance', 'kraken', 'ftx', 'gemini', 'kucoin'],
  'DOT': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'AVAX': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin'],
  'SHIB': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin'],
  'MATIC': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'LTC': ['coinbase', 'binance', 'kraken', 'ftx', 'gemini', 'kucoin', 'bitfinex'],
  'UNI': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'LINK': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini', 'kucoin', 'bitfinex'],
  'ATOM': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin'],
  'ETC': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'XLM': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'BCH': ['coinbase', 'binance', 'kraken', 'ftx', 'gemini', 'kucoin', 'bitfinex'],
  'ALGO': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin'],
  'VET': ['binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'ICP': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin'],
  'FIL': ['coinbase', 'binance', 'kraken', 'ftx', 'gemini', 'kucoin'],
  'TRX': ['binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'EOS': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin', 'bitfinex'],
  'THETA': ['binance', 'kraken', 'ftx', 'kucoin'],
  'XTZ': ['coinbase', 'binance', 'kraken', 'ftx', 'kucoin'],
  'AAVE': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini', 'kucoin'],
  'MKR': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini'],
  'COMP': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx'],
  'SNX': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'CRV': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'YFI': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini'],
  'SUSHI': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'BAL': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx'],
  '1INCH': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'REN': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx'],
  'ZRX': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini'],
  'BAT': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini'],
  'MANA': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'gemini', 'kucoin'],
  'ENJ': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'SAND': ['coinbase', 'binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'AXS': ['binance', 'kraken', 'uniswap', 'sushiswap', 'ftx', 'kucoin'],
  'CHZ': ['binance', 'kraken', 'ftx', 'kucoin'],
  'HOT': ['binance', 'kraken', 'ftx', 'kucoin'],
  'HBAR': ['binance', 'kraken', 'ftx', 'kucoin'],
  'CAKE': ['binance', 'pancakeswap', 'ftx', 'kucoin']
}

// Helper function to get exchanges for a crypto symbol
export function getExchangesForCrypto(symbol: string): ExchangeInfo[] {
  const exchangeIds = CRYPTO_EXCHANGE_MAPPING[symbol.toUpperCase()] || []
  return EXCHANGES.filter(exchange => exchangeIds.includes(exchange.id))
}

// Helper function to check if a crypto is available on a specific exchange
export function isCryptoOnExchange(symbol: string, exchangeId: string): boolean {
  const exchangeIds = CRYPTO_EXCHANGE_MAPPING[symbol.toUpperCase()] || []
  return exchangeIds.includes(exchangeId)
}

// Helper function to filter cryptos by exchange availability
export function filterCryptosByExchange<T extends { symbol: string }>(
  cryptos: T[],
  exchangeId: string
): T[] {
  if (!exchangeId || exchangeId === 'all') {
    return cryptos
  }
  
  return cryptos.filter(crypto => isCryptoOnExchange(crypto.symbol, exchangeId))
}

// Helper function to get all available exchanges from the current crypto list
export function getAvailableExchanges<T extends { symbol: string }>(cryptos: T[]): ExchangeInfo[] {
  const availableExchangeIds = new Set<string>()
  
  cryptos.forEach(crypto => {
    const exchangeIds = CRYPTO_EXCHANGE_MAPPING[crypto.symbol.toUpperCase()] || []
    exchangeIds.forEach(id => availableExchangeIds.add(id))
  })
  
  return EXCHANGES.filter(exchange => availableExchangeIds.has(exchange.id))
}