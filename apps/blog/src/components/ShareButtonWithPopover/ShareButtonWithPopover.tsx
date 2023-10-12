'use client'

import React, { useCallback, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { Language } from '@/i18n/i18n.settings'

const popoverTimer = 1000

export const ShareButtonWithPopover = ({ shareData, locale }: { shareData: ShareData; locale: Language }) => {
  const [open, setOpen] = useState(false)
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null)

  /**
   * Handles the click event for the button.
   * If the browser does not support the share API, it will copy the text (url/text/title), otherwise it will open the share dialog.
   * Dialog will disappear after "popoverTimer" ms or if the user clicks outside the popover
   *
   * @param {boolean} open - Whether the popover should be opened or closed.
   * @async
   * @return {void}
   */
  const handleClick = useCallback(
    async (open: boolean) => {
      try {
        if (!navigator.share) {
          await navigator.clipboard.writeText(shareData.url || shareData.text || shareData.title || '')
          setOpen(open)

          if (timerId) {
            clearTimeout(timerId)
          }

          if (!open) {
            setTimerId(null)
          }

          if (open) {
            const newTimerId = setTimeout(() => {
              setOpen(false)
              setTimerId(null)
            }, popoverTimer)
            setTimerId(newTimerId)
          }
        } else {
          await navigator.share(shareData)
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }

        console.error(error)
      }
    },
    [shareData, timerId],
  )

  return (
    <Popover.Root open={open} defaultOpen onOpenChange={open => handleClick(open)}>
      <Popover.Trigger className="flex" asChild>
        <div>
          <button className="relative after:top-1/2 after:left-1/2 after:absolute after:-translate-x-1/2 after:-translate-y-1/2 w-[150%] h-[150%] transition-colors transition-opacity opacity-30 hover:text-memebattleYellow hover:opacity-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none">
              <path
                stroke="currentColor"
                d="m6.523 12.622 5.454 3.506m0-10.256L6.523 9.378M17.5 17.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10.5-6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </button>
        </div>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="flex w-fit p-3 whitespace-nowrap text-sm rounded-lg rounded-br-lg bg-gray-200 overflow-hidden"
          side="top"
          align="end"
          sideOffset={5}
          hideWhenDetached
        >
          {locale === 'en' ? 'Copied to clipboard' : 'Ссылка скопирована'}
          <Popover.Arrow className="fill-gray-200" width={10} height={10} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
