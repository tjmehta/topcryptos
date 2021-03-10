import S3Store from '../S3Store'

describe('S3Store', () => {
  it('should set and get', async () => {
    const store = new S3Store()
    await store.set('foo', { foo: 'bar' })
    const foo = await store.get<{ foo: string }>('foo')
    expect(foo).toMatchInlineSnapshot(`
      Object {
        "foo": "bar",
      }
    `)
  })

  it('should get undefined', async () => {
    const store = new S3Store()
    const bar = await store.get<{ foo: string }>('bar')
    expect(bar).toMatchInlineSnapshot(`null`)
  })
})
