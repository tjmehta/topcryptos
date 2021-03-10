import { padLeft } from '../padLeft'

describe('padLeft', () => {
  it('should padLeft', () => {
    expect(padLeft('1', 2, ' ')).toMatchInlineSnapshot(`" 1"`)
  })
})
