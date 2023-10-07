'use client'

import { Popover as HPopover } from '@headlessui/react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

type DropdownDirection = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface PopoverProps {
  children?: ReactNode | string
  trigger?: ReactNode
  direction?: DropdownDirection
  useShare?: boolean
}
export const Popover = (props: PopoverProps) => {
  const { children, direction = 'topRight', trigger, useShare = false } = props

  let isShared = false
  useEffect(() => {
    if (navigator) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      isShared = !!window.navigator.share
      console.log(window.navigator, isShared)
    }
  })

  console.log(isShared)

  // eslint-disable-next-line prefer-const
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null)

  const handleClick = (open: boolean, close: () => void) => {
    // Clear any existing timer when the popover is clicked
    if (timerId) {
      clearTimeout(timerId)
    }

    if (open) {
      // Set a new timer to close the popover after 4 seconds
      const newTimerId = setTimeout(() => {
        close()
        setTimerId(null) // Clear the timer ID after it's executed
      }, 2000)
      setTimerId(newTimerId)
    }
  }

  return useShare ? (
    <HPopover className="relative">
      {({ open, close }) => (
        <>
          <HPopover.Button as="div" onClick={() => handleClick(open, close)}>
            {trigger}
          </HPopover.Button>
          {open && (
            <HPopover.Panel
              static
              className={`absolute flex flex-col border-solid rounded-lg bg-gray-500 overflow-hidden z-40 ui-open:[${direction}]`}
            >
              {children}
            </HPopover.Panel>
          )}
        </>
      )}
    </HPopover>
  ) : (
    <div>{trigger}</div>
  )
}
