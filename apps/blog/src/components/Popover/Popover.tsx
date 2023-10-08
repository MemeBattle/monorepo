'use client'

import { Popover as Popup } from '@headlessui/react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'

type DropdownDirection = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface PopoverProps {
  content?: ReactNode | string
  trigger?: ReactNode
  direction?: DropdownDirection
  useShare?: boolean
  time?: number
  useTimer?: boolean
  customStyles?: string
}

/**
 * Renders a popover component.
 *
 * @param {PopoverProps} props - The props object containing the following properties:
 *   - content: The content to be displayed inside the popover.
 *   - direction: The direction in which the popover should open. Defaults to 'topLeft'.
 *   - trigger: The element that triggers the popover.
 *   - time: The duration in milliseconds after which the popover should close. Defaults to 1000.
 *   - useTimer: A boolean indicating whether to use the timer functionality. Defaults to false.
 *   - useShare: A boolean indicating whether to use the share functionality. Defaults to false.
 *   - customStyles: The custom styles to be applied to the popover.
 * @return {ReactElement} - The rendered popover component.
 */
export const Popover = (props: PopoverProps) => {
  const { content, direction = 'topLeft', trigger, time = 1000, useTimer = false, useShare = false, customStyles = '' } = props
  const [isShared, setIsShared] = useState(false)
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (navigator) {
      setIsShared(!!navigator.share)
    }
  }, [isShared])

  const handleClick = useCallback(
    (open: boolean, close: () => void) => {
      if (timerId) {
        clearTimeout(timerId)
      }

      if (!open && useTimer) {
        const newTimerId = setTimeout(() => {
          close()
          setTimerId(null)
        }, time)
        setTimerId(newTimerId)
      }
    },
    [time, timerId, useTimer],
  )

  return useShare && isShared ? (
    <div>{trigger}</div>
  ) : (
    <Popup className="relative">
      {({ open, close }) => (
        <>
          <Popup.Button as="div" onClick={() => handleClick(open, close)} className="flex">
            {trigger}
          </Popup.Button>
          <Popup.Panel
            className={`absolute flex w-fit p-3 whitespace-nowrap flex-col border-solid rounded-lg bg-gray-300 overflow-hidden z-40 ${customStyles} ${direction}`}
          >
            {content}
          </Popup.Panel>
        </>
      )}
    </Popup>
  )
}
