import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  SquareArrowOutUpRight,
  Star,
} from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cmcUrl, marketCap, percent, price, score, toneClass, trend } from '@/modules/format'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Crypto } from '@/modules/processRankings'
import { NAN_SCORE } from '@/modules/processRankings'
import { cn } from '@/lib/utils'

type Meta = { align?: 'right'; priority?: '2xl' | '3xl' | '4xl'; flex?: boolean }

/**
 * The desktop rankings table.
 *
 * Columns carry a `priority` so the table sheds detail as it narrows instead of
 * forcing a horizontal scroll.
 *
 * These are *container* queries, not viewport ones. The table sits in a
 * half-width grid column on large screens, so a viewport-based `xl:` rule
 * happily showed nine columns inside a 660px box and pushed the last four off
 * the edge. Sizing against the container is what the layout actually needs.
 */
export function RankingsTable({
  data,
  highlightedIds,
  hiddenIds,
  onToggleHighlight,
  onToggleHidden,
  onHover,
  containerClassName,
}: {
  data: Crypto[]
  highlightedIds: Set<string>
  hiddenIds: Set<string>
  onToggleHighlight: (id: string) => void
  onToggleHidden: (id: string) => void
  onHover: (id: string | null) => void
  containerClassName?: string
}) {
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo<ColumnDef<Crypto>[]>(
    () => [
      {
        id: 'highlight',
        header: () => <span className="sr-only">Highlight</span>,
        cell: ({ row }) => {
          const on = highlightedIds.has(row.original.id)
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-pressed={on}
                  aria-label={`${on ? 'Stop highlighting' : 'Highlight'} ${row.original.name} in the chart`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleHighlight(row.original.id)
                  }}
                >
                  <Star
                    className={cn(
                      'size-3.5',
                      on ? 'fill-spotlight text-spotlight' : 'text-muted-foreground',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Highlight in chart</TooltipContent>
            </Tooltip>
          )
        },
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'rank',
        header: '#',
        cell: ({ row }) => (
          <span className="figure text-muted-foreground">{row.original.rank}</span>
        ),
        meta: { align: 'right' } as Meta,
        size: 48,
      },
      {
        accessorKey: 'name',
        header: 'Coin',
        meta: { flex: true } as Meta,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <a
              href={cmcUrl(row.original.slug)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="group inline-flex min-w-0 items-center gap-1.5 underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 hover:decoration-foreground"
            >
              <span className="truncate font-medium">{row.original.name}</span>
              <SquareArrowOutUpRight className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            <span className="figure shrink-0 text-xs text-muted-foreground">
              {row.original.symbol}
            </span>
          </div>
        ),
      },
      {
        id: 'pricePct',
        accessorFn: (c) => c.total?.pricePct ?? 0,
        header: 'Price',
        cell: ({ getValue }) => {
          const v = getValue<number>()
          return (
            <span className={cn('figure font-medium', toneClass(v))}>
              <span aria-hidden className="mr-0.5 text-[0.7em]">
                {trend(v)}
              </span>
              {percent(v)}
            </span>
          )
        },
        meta: { align: 'right' } as Meta,
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ row }) =>
          row.original.insufficientHistory ? (
            <Badge
              variant="outline"
              className="text-muted-foreground"
              title="Too new to score — not enough history in this window"
            >
              New
            </Badge>
          ) : (
            <span className="figure text-muted-foreground">
              {row.original.score === NAN_SCORE ? '—' : score(row.original.score)}
            </span>
          ),
        meta: { align: 'right' } as Meta,
      },
      {
        id: 'marketCap',
        accessorFn: (c) => c.total?.endQuote.marketCap ?? 0,
        header: 'Mkt cap',
        cell: ({ getValue }) => (
          <span className="figure">{marketCap(getValue<number>())}</span>
        ),
        meta: { align: 'right', priority: '2xl' } as Meta,
      },
      {
        id: 'price',
        accessorFn: (c) => c.total?.endQuote.price ?? 0,
        header: 'Last',
        cell: ({ getValue }) => (
          <span className="figure">{price(getValue<number>())}</span>
        ),
        meta: { align: 'right', priority: '3xl' } as Meta,
      },
      {
        id: 'marketCapPct',
        accessorFn: (c) => c.total?.marketCapPct ?? 0,
        header: 'Mkt cap %',
        cell: ({ getValue }) => {
          const v = getValue<number>()
          return <span className={cn('figure', toneClass(v))}>{percent(v)}</span>
        },
        meta: { align: 'right', priority: '4xl' } as Meta,
      },
      {
        id: 'rankDelta',
        accessorFn: (c) => 0 - (c.total?.rankDelta ?? 0),
        header: 'Rank Δ',
        cell: ({ getValue }) => {
          const v = getValue<number>()
          return (
            <span className={cn('figure', toneClass(v))}>
              {v > 0 ? `+${v}` : v === 0 ? '—' : v}
            </span>
          )
        },
        meta: { align: 'right', priority: '4xl' } as Meta,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const isHidden = hiddenIds.has(row.original.id)
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-pressed={isHidden}
                  aria-label={`${isHidden ? 'Show' : 'Hide'} ${row.original.name} in the chart`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleHidden(row.original.id)
                  }}
                >
                  {isHidden ? (
                    <EyeOff className="size-3.5 text-muted-foreground" />
                  ) : (
                    <Eye className="size-3.5 text-muted-foreground/50" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isHidden ? 'Show in chart' : 'Hide from chart'}
              </TooltipContent>
            </Tooltip>
          )
        },
        enableSorting: false,
        size: 40,
      },
    ],
    [highlightedIds, hiddenIds, onToggleHighlight, onToggleHidden],
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

  /*
   * Thresholds are the container widths at which each column actually fits, not
   * nominal t-shirt sizes: six core columns need ~500px, so the extras only
   * start reappearing past 672px (@2xl).
   */
  const priorityClass = (m?: Meta) =>
    m?.priority === '2xl'
      ? 'hidden @2xl:table-cell'
      : m?.priority === '3xl'
        ? 'hidden @3xl:table-cell'
        : m?.priority === '4xl'
          ? 'hidden @4xl:table-cell'
          : ''

  return (
    <div className="@container">
    <Table containerClassName={containerClassName}>
      <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="border-border hover:bg-transparent">
            {hg.headers.map((header) => {
              const meta = header.column.columnDef.meta as Meta | undefined
              const sorted = header.column.getIsSorted()
              const sortable = header.column.getCanSort()
              return (
                <TableHead
                  key={header.id}
                  aria-sort={
                    sorted === 'asc'
                      ? 'ascending'
                      : sorted === 'desc'
                        ? 'descending'
                        : undefined
                  }
                  className={cn(
                    'h-9 whitespace-nowrap text-xs font-medium text-muted-foreground',
                    meta?.align === 'right' && 'text-right',
                    sortable && 'cursor-pointer select-none hover:text-foreground',
                    priorityClass(meta),
                  )}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      meta?.align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sortable &&
                      (sorted === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-30" />
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
          const isHidden = hiddenIds.has(id)
          return (
            <TableRow
              key={row.id}
              data-state={highlightedIds.has(id) ? 'selected' : undefined}
              className={cn('border-border/60', isHidden && 'opacity-40')}
              onMouseEnter={() => onHover(id)}
              onMouseLeave={() => onHover(null)}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as Meta | undefined
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      'py-2',
                      meta?.flex
                        ? 'w-full max-w-0 overflow-hidden'
                        : 'whitespace-nowrap',
                      meta?.align === 'right' && 'text-right',
                      priorityClass(meta),
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
