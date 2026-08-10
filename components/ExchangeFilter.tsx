import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import type { ExchangeSummary } from '@/modules/exchangeMap'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export function ExchangeFilter({
  exchanges,
  selected,
  onChange,
  disabled,
}: {
  exchanges: ExchangeSummary[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedSet = new Set(selected)

  const toggle = (id: string) => {
    const next = new Set(selectedSet)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    // Preserve the ranked order of `exchanges` rather than click order, so the
    // URL is stable regardless of how the user got to a given selection.
    onChange(exchanges.map((e) => e.id).filter((id) => next.has(id)))
  }

  const label =
    selected.length === 0
      ? 'All exchanges'
      : selected.length === 1
      ? exchanges.find((e) => e.id === selected[0])?.name ?? '1 exchange'
      : `${selected.length} exchanges`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={
            exchanges.length === 0
              ? 'Exchange filter unavailable'
              : `Filter by exchange: ${label}`
          }
          disabled={disabled || exchanges.length === 0}
          className="h-8 max-w-[15rem] justify-between gap-1.5 rounded-full border-border/70 bg-secondary/50 px-3 text-sm font-normal"
        >
          <span className="truncate">
            {exchanges.length === 0 ? 'Exchanges unavailable' : label}
          </span>
          {selected.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 shrink-0 rounded-full px-1.5 text-[0.7rem]"
            >
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[16rem] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search exchanges..." />
          <CommandList>
            <CommandEmpty>No exchange found.</CommandEmpty>
            <CommandGroup>
              {exchanges.map((exchange) => {
                const isSelected = selectedSet.has(exchange.id)
                return (
                  <CommandItem
                    key={exchange.id}
                    value={exchange.name}
                    onSelect={() => toggle(exchange.id)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50',
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="truncate">{exchange.name}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>

            {selected.length > 0 && (
              <>
                <Separator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange([])}
                    className="cursor-pointer justify-center text-muted-foreground"
                  >
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
