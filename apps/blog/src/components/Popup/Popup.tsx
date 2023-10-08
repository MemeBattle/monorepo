'use client'

import type { ReactNode } from 'react'
import React, { useCallback, useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'

interface PopupProps {
  trigger: ReactNode
  content: ReactNode | string
  useShare?: boolean
  time?: number
  useTimer?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'center' | 'end' | 'start'
  sideOffset?: number
}

/**
 * Renders a popup component.
 *
 * @param {PopupProps} props - The props for the popup component.
 *                           - `trigger`: The trigger element for the popup.
 *                           - `content`: The content of the popup.
 *                           - `useShare`: Optional. Whether to use the share feature. Defaults to `false`.
 *                           - `time`: Optional. The duration in milliseconds before the popup automatically closes. Defaults to `1000`.
 *                           - `useTimer`: Optional. Whether to use the timer for auto-closing the popup. Defaults to `false`.
 *                           - `side`: Optional. The side of the popup. Defaults to `'top'`.
 *                           - `align`: Optional. The alignment of the popup. Defaults to `'end'`.
 *                           - `sideOffset`: Optional. The offset of the popup from the side. Defaults to `5`.
 * @returns {JSX.Element} The rendered popup component.
 */
export const Popup = (props: PopupProps) => {
  const { trigger, content, useShare = false, time = 1000, useTimer = false, side = 'top', align = 'end', sideOffset = 5 } = props

  const [open, setOpen] = useState(false)
  const [isShared, setIsShared] = useState(false)
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null)

  // Check if the share feature is available
  useEffect(() => {
    if (navigator) {
      setIsShared(!!navigator.share)
    }
  }, [isShared])

  /**
   * Handles the click event on the popup trigger.
   *
   * @param {boolean} open - Whether the popup should be opened or closed.
   */
  const handleClick = useCallback(
    (open: boolean) => {
      setOpen(open)

      // Clear timer if popup is closed
      if (!open && useTimer) {
        setTimerId(null)
      }

      // Clear timer if popup is closed
      if (timerId) {
        clearTimeout(timerId)
      }

      // Start timer if popup is opened and useTimer is enabled
      if (open && useTimer) {
        const newTimerId = setTimeout(() => {
          setOpen(false)
          setTimerId(null)
        }, time)
        setTimerId(newTimerId)
      }
    },
    [time, timerId, useTimer],
  )

  return useShare && isShared ? (
    // Render trigger element if useShare is enabled and share feature is available
    <div>{trigger}</div>
  ) : (
    // Added custom behavior for optional timer
    <Popover.Root open={open} defaultOpen onOpenChange={open => handleClick(open)}>
      <Popover.Trigger className="flex" asChild>
        <div>{trigger}</div>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="flex w-fit p-3 whitespace-nowrap text-sm rounded-lg bg-gray-300 overflow-hidden"
          side={side}
          align={align}
          sideOffset={sideOffset}
          hideWhenDetached
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
