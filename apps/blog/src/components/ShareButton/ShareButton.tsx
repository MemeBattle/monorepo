'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { Language } from '@/i18n/i18n.settings'
import { useTranslation } from '@/i18n'

const popoverTimer = 1000

export const ShareButton = ({ shareData, locale }: { shareData: ShareData; locale: Language }) => {
  const [open, setOpen] = useState(false)
  const timerIdRef = useRef<NodeJS.Timeout | null>(null)
  const textRef = useRef('')
  const translation = useTranslation(locale, 'posts')

  const handleTimerClear = useCallback(() => {
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current)
      timerIdRef.current = null
    }
  }, [])

  const handleStartTimer = useCallback(() => {
    timerIdRef.current = setTimeout(() => {
      setOpen(false)
      handleTimerClear()
    }, popoverTimer)
  }, [handleTimerClear])

  const handlePopoverClick = useCallback(() => {
    if (open) {
      setOpen(false)
      handleTimerClear()
    } else {
      setOpen(true)
      handleTimerClear()
      handleStartTimer()
    }
  }, [handleStartTimer, handleTimerClear, open])

  useEffect(
    () => () => {
      handleTimerClear()
    },
    [handleTimerClear],
  )

  /**
   * Handles the click event for the button.
   * If the browser does not support the share API, it will copy the text (url/text/title), otherwise it will open the share dialog.
   * Dialog will disappear after "popoverTimer" ms or if the user clicks outside the popover
   *
   * @async
   * @return {void}
   */
  const handleClick = useCallback(async () => {
    try {
      if (!navigator.share) {
        await navigator.clipboard.writeText(shareData.url || shareData.text || shareData.title || '')
        const { t } = await translation
        textRef.current = t('copied')
        handlePopoverClick()
      } else {
        await navigator.share(shareData)
      }
    } catch (error: unknown) {
      handleTimerClear()

      if (error instanceof Error && error.name === 'AbortError') {
        return
      }

      console.error(error)
    }
  }, [handlePopoverClick, handleTimerClear, shareData, translation])

  return (
    <Popover.Root open={open} defaultOpen onOpenChange={handleClick}>
      <Popover.Trigger className="flex" asChild>
        <svg
          className="items-center justify-end opacity-30 hover:text-memebattleYellow hover:opacity-100"
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          fill="none"
        >
          <path
            stroke="currentColor"
            d="m6.523 12.622 5.454 3.506m0-10.256L6.523 9.378M17.5 17.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10.5-6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="flex relative w-fit p-3 whitespace-nowrap text-sm rounded-lg rounded-br-lg bg-gray-200 focus:outline-none"
          side="top"
          align="end"
          sideOffset={5}
          hideWhenDetached
        >
          {textRef.current}
          <Popover.Arrow className="fill-gray-200" width={10} height={10} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
