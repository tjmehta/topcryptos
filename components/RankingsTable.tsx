import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import type { Crypto } from '@/modules/processRankings'
import { NAN_SCORE } from '@/modules/processRankings'
import { cn } from '@/lib/utils'
import { format } from 'd3'
import { useMemo, useState } from 'react'

const num = format('.2f')
const score4 = format('.4f')
const usd = format('$,.4f')
const compact = (v: number) => format('~s')(v).replace('G', 'B')

function pctClass(value: number) {
  if (!Number.isFinite(value) || value === 0) return 'text-muted-foreground'
  return value > 0 ? 'text-[color:var(--chart-1)]' : 'text-[color:var(--chart-2)]'
}

export function RankingsTable({
  data,
  selectedCryptoIds,
  disabledCryptoIds,
  onToggleSelected,
  onToggleDisabled,
  onHover,
}: {
  data: Crypto[]
  selectedCryptoIds: Set<string>
  disabledCryptoIds: Set<string>
  onToggleSelected: (id: string) => void
  onToggleDisabled: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo<ColumnDef<Crypto>[]>(
    () => [
      {
        id: 'select',
        header: () => null,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedCryptoIds.has(row.original.id)}
            onCheckedChange={() => onToggleSelected(row.original.id)}
            aria-label={`Highlight ${row.original.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        size: 36,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <a
            href={`//coinmarketcap.com/currencies/${row.original.slug}/`}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.name}
          </a>
        ),
      },
      { accessorKey: 'symbol', header: 'Symbol' },
      {
        accessorKey: 'rank',
        header: 'Score Rank',
        meta: { align: 'right' },
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ row }) =>
          row.original.score === NAN_SCORE ? '—' : score4(row.original.score),
        meta: { align: 'right' },
      },
      {
        id: 'pricePct',
        accessorFn: (c) => c.total?.pricePct ?? 0,
        header: 'Price %',
        cell: ({ getValue }) => {
          const v = getValue<number>()
          return <span className={pctClass(v)}>{`${num(v)}%`}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'marketCap',
        accessorFn: (c) => c.total?.endQuote.marketCap ?? 0,
        header: 'Mkt Cap',
        cell: ({ getValue }) => compact(getValue<number>()),
        meta: { align: 'right' },
      },
      {
        id: 'marketCapPct',
        accessorFn: (c) => c.total?.marketCapPct ?? 0,
        header: 'Mkt Cap %',
        cell: ({ getValue }) => {
          const v = getValue<number>()
          return <span className={pctClass(v)}>{`${num(v)}%`}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'rankDelta',
        accessorFn: (c) => 0 - (c.total?.rankDelta ?? 0),
        header: 'Rank Δ',
        meta: { align: 'right' },
      },
      {
        id: 'marketCapRank',
        accessorFn: (c) => c.total?.endQuote.rankByMarketCap ?? 0,
        header: 'Mkt Cap Rank',
        meta: { align: 'right' },
      },
      {
        id: 'price',
        accessorFn: (c) => c.total?.endQuote.price ?? 0,
        header: 'Price',
        cell: ({ getValue }) => usd(getValue<number>()),
        meta: { align: 'right' },
      },
    ],
    [selectedCryptoIds, onToggleSelected],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  })

  return (
    <div className="max-h-[40rem] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 backdrop-blur">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="border-border hover:bg-transparent">
              {hg.headers.map((header) => {
                const align = (header.column.columnDef.meta as any)?.align
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'whitespace-nowrap text-muted-foreground',
                      align === 'right' && 'text-right',
                      header.column.getCanSort() && 'cursor-pointer select-none',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getCanSort() &&
                        (sorted === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        ))}
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground"
              >
                No coins match the current filter.
              </TableCell>
            </TableRow>
          )}

          {table.getRowModel().rows.map((row) => {
            const id = row.original.id
            const isDisabled = disabledCryptoIds.has(id)
            return (
              <TableRow
                key={row.id}
                data-state={selectedCryptoIds.has(id) ? 'selected' : undefined}
                className={cn(
                  'border-border',
                  isDisabled && 'opacity-40',
                  'cursor-pointer',
                )}
                onMouseEnter={() => onHover(id)}
                onMouseLeave={() => onHover(null)}
                onDoubleClick={() => onToggleDisabled(id)}
              >
                {row.getVisibleCells().map((cell) => {
                  const align = (cell.column.columnDef.meta as any)?.align
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'whitespace-nowrap',
                        align === 'right' && 'text-right tabular-nums',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
