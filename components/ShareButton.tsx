import { Check, Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Copies the current URL — which carries the algorithm, window, filter, sort and
 * highlighted coins — so the link reproduces exactly this view. On devices
 * with a native share sheet (phones, iPads) that sheet is used instead, since
 * it lands the link straight in Messages/Telegram rather than a clipboard.
 */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const share = async () => {
    const url = window.location.href
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    const canSheet =
      typeof nav.share === 'function' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches
    try {
      if (canSheet) {
        await nav.share({ title, text, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // AbortError when the sheet is dismissed, or clipboard denied — either
      // way there is nothing useful to tell the user.
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={share}
      aria-live="polite"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      {copied ? 'Copied' : 'Share'}
    </Button>
  )
}
