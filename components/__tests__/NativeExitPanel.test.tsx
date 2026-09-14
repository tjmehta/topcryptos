/** @jest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NativeExitPanel, plannedExitUtc } from '../NativeExitPanel'
import { getNativeExitEvidence } from '@/modules/nativeExitEvidence'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })
const render = (view = 7, filtersActive = false) => act(() => root.render(<NativeExitPanel mode="daily" view={view} algorithm="classic" label="Classic" filtersActive={filtersActive} />))
const changeSelect = (label: string, value: string) => act(() => {
  const input = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement
  input.value = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
})

test('UTC plans cross leap days and year boundaries without local daylight-saving arithmetic', () => {
  expect(plannedExitUtc('2024-02-28T13:15', 2, 'daily')).toBe('2024-03-01T13:15:00.000Z')
  expect(plannedExitUtc('2026-12-31T23:30', 3, 'hourly')).toBe('2027-01-01T02:30:00.000Z')
  expect(plannedExitUtc('2026-03-08T01:30', 1, 'daily')).toBe('2026-03-09T01:30:00.000Z')
  for (const date of ['', '2026-02-30T10:00', '2026-13-01T10:00', '2026-09-14T25:00', '2026-09-14T10:00Z', '9999-12-31T23:00']) {
    expect(plannedExitUtc(date, 1, 'daily')).toBeNull()
  }
  expect(plannedExitUtc('2026-09-14T10:00', -1, 'daily')).toBeNull()
})

test('does not select a retrospective winner or invent an entry time', () => {
  render()
  expect(container.textContent).toContain('do not establish an automatic exit recommendation')
  expect((container.querySelector('select[aria-label="Planned holding period"]') as HTMLSelectElement).value).toBe('')
  expect((container.querySelector('input') as HTMLInputElement).value).toBe('')
  expect(container.querySelector('time')).toBeNull()
  changeSelect('Planned holding period', '7')
  expect(container.querySelector('time')).toBeNull()
  act(() => {
    const input = container.querySelector('input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-09-14T04:30')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-09-21T04:30:00.000Z')
})

test('cost and missing-price controls use the corresponding verified basket means', () => {
  render(3)
  const evidence = getNativeExitEvidence('daily', 3, 'classic')!
  const metrics = evidence.windows.find((row) => row.holding === 30)!.metrics!
  const row = () => [...container.querySelectorAll('tbody tr')].find((item) => item.querySelector('button')?.textContent === '30 days')!
  const formatted = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
  expect(row().textContent).toContain(formatted(metrics.meanNetLoss50))
  changeSelect('Exit evidence fee', '100')
  expect(row().textContent).toContain(formatted(metrics.meanNetLoss100))
  changeSelect('Missing exit valuation', 'flat')
  expect(row().textContent).toContain(formatted(metrics.meanNet100))
  expect(container.querySelector('thead')?.textContent).toContain('0.5% fees')
  expect(row().querySelectorAll('td')[2].textContent).toBe(String(metrics.exitMissing))
})

test('unsupported history keeps missing outcomes distinct and suppresses the planner', () => {
  render(90, true)
  expect(container.textContent).toContain('Not enough matching entry dates')
  expect(container.textContent).toContain('No completed tests')
  expect(container.textContent).toContain('hidden-coin exclusions')
  expect(container.querySelector('input')).toBeNull()
  expect(container.textContent).not.toContain('0.00%')
})
