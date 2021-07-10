import stringify from 'fast-json-stable-stringify'

export type CacheOpts<Result, Args> = {
  set: (args: Args, result: Result) => Promise<unknown>
  get: (args: Args) => Promise<Result | undefined>
}

export function cache<Result, Args extends Array<unknown>>(
  opts: CacheOpts<Result, Args>,
  task: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    // check if result is cached
    const cached = await opts.get(args)
    if (cached != null) return cached

    // no cached result, run task
    const result = await task(...args)

    // save result in cache
    await opts.set(args, result)

    return result
  }
}

export function cacheKey(name: string, opts: {}): string {
  const out = {}
  Object.keys(opts).forEach((key) => {
    out[key] = opts[key].toISOString
      ? opts[key].toISOString()
      : opts[key].toString()
  })
  return `${name}:${stringify(out).replace(/\\/g, '')}`
}
