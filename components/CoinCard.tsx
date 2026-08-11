import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Eye, EyeOff, MoreVertical, SquareArrowOutUpRight, Star } from 'lucide-react'
import { cmcUrl, marketCap, percent, price, score, toneClass, trend } from '@/modules/format'

import { Button } from '@/components/ui/button'
import type { Crypto } from '@/modules/processRankings'
import { NAN_SCORE } from '@/modules/processRankings'
import { cn } from '@/lib/utils'

/**
 * One coin, as a card. Used below `md`, where the desktop table's ten columns
 * would be 1200px wide in a 390px viewport — every figure that matters was
 * off-screen behind a horizontal scroll.
 *
 * The card shows the four numbers worth scanning on a phone (rank, price move,
 * market cap, score) and pushes the rest into the row menu.
 */
export function CoinCard({
  crypto,
  highlighted,
  hidden,
  onToggleHighlight,
  onToggleHidden,
}: {
  crypto: Crypto
  highlighted: boolean
  hidden: boolean
  onToggleHighlight: (id: string) => void
  onToggleHidden: (id: string) => void
}) {
  const pricePct = crypto.total?.pricePct ?? 0
  const glyph = trend(pricePct)

  return (
    <article
      className={cn(
        'relative flex items-start gap-3 rounded-lg border border-border/60 bg-card/60 p-3 transition-colors',
        highlighted && 'border-spotlight/60 bg-spotlight/5',
        hidden && 'opacity-45',
      )}
    >
      <div className="figure mt-0.5 w-9 shrink-0 text-right text-sm text-muted-foreground">
        {crypto.rank}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {/* The name has always linked to CoinMarketCap, but nothing said so.
              Underline + icon make it read as a link without a hover state,
              which a touchscreen never has. */}
          <a
            href={cmcUrl(crypto.slug)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-w-0 items-center gap-1.5 font-medium underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 hover:decoration-foreground"
          >
            <span className="truncate">{crypto.name}</span>
            <SquareArrowOutUpRight className="size-3 shrink-0 text-muted-foreground" />
          </a>
        </div>

        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="figure">{crypto.symbol}</span>
          <span aria-hidden>·</span>
          <span className="figure">{marketCap(crypto.total?.endQuote.marketCap)}</span>
          <span aria-hidden>·</span>
          <span className="figure">{price(crypto.total?.endQuote.price)}</span>
        </div>

        <div className="mt-2 flex items-baseline gap-3">
          <span className={cn('figure text-base font-medium', toneClass(pricePct))}>
            <span aria-hidden className="mr-0.5 text-[0.7em]">
              {glyph}
            </span>
            {percent(pricePct)}
          </span>
          <span className="figure text-xs text-muted-foreground">
            {crypto.insufficientHistory
              ? 'too new to score'
              : `score ${crypto.score === NAN_SCORE ? '—' : score(crypto.score)}`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-pressed={highlighted}
          aria-label={
            highlighted
              ? `Stop highlighting ${crypto.name} in the chart`
              : `Highlight ${crypto.name} in the chart`
          }
          onClick={() => onToggleHighlight(crypto.id)}
        >
          <Star
            className={cn(
              'size-4',
              highlighted
                ? 'fill-spotlight text-spotlight'
                : 'text-muted-foreground',
            )}
          />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`More actions for ${crypto.name}`}
            >
              <MoreVertical className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onToggleHidden(crypto.id)}>
              {hidden ? (
                <>
                  <Eye className="size-4" /> Show in chart
                </>
              ) : (
                <>
                  <EyeOff className="size-4" /> Hide from chart
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={cmcUrl(crypto.slug)} target="_blank" rel="noreferrer noopener">
                <SquareArrowOutUpRight className="size-4" /> View on CoinMarketCap
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  )
}
