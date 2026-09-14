import handler from '../../pages/api/outlook-evidence'

function response() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  }
  return res
}
test('serves only the requested context and keeps the full research corpus off the client', () => {
  const res = response()
  handler(
    {
      method: 'GET',
      query: { mode: 'daily', view: '7', method: 'classic', state: 'building' },
    } as any,
    res,
  )
  expect(res.status).toHaveBeenCalledWith(200)
  const data = res.json.mock.calls[0][0]
  expect(data.context).toBe('daily:7:classic:building')
  expect(data.rows.length).toBeGreaterThan(0)
  expect(data.cells).toBeUndefined()
  expect(JSON.stringify(data).length).toBeLessThan(15000)
})
test('rejects array parameters, unknown methods and mutations', () => {
  for (const query of [
    { mode: 'daily', view: ['7'], method: 'classic', state: 'building' },
    { mode: 'daily', view: '7', method: 'constructor', state: 'building' },
  ]) {
    const res = response()
    handler({ method: 'GET', query } as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
  }
  const res = response()
  handler({ method: 'POST', query: {} } as any, res)
  expect(res.status).toHaveBeenCalledWith(405)
})
