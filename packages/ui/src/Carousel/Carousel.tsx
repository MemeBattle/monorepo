import type { Theme } from '@mui/material/styles'
import { styled } from '@mui/material/styles'
import type { ReactElement, ReactNode } from 'react'
import type { CarouselContextValue } from './Carousel.context'
import { CarouselContext } from './Carousel.context'
import React, { useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react'
import throttle from 'lodash/throttle'

import { useMediaQuery } from '../utils/useMediaQuery'

const StyledCarouselSlide = styled('div')(() => ({
  display: 'flex',
  scrollSnapAlign: 'center',
  minHeight: '100%',
  minWidth: '100%',
}))

interface CarouselSlideProps {
  children: ReactElement
  index: number
}

const CarouselSlide = ({ children, index }: CarouselSlideProps) => {
  const { scrollToIndex } = useContext(CarouselContext)

  const ref = useRef<HTMLDivElement>(null)

  const isColumnView = useMediaQuery((theme: Theme) => theme.breakpoints.up('sm'))

  useEffect(() => {
    if (!ref.current || !ref.current.parentElement) {
      return
    }
    if (index === scrollToIndex) {
      if (isColumnView) {
        ref.current.parentElement.scrollTop = ref.current.offsetTop
      } else {
        ref.current.parentElement.scrollLeft = ref.current.offsetLeft
      }
    }
  }, [index, scrollToIndex, isColumnView])

  return <StyledCarouselSlide ref={ref}>{children}</StyledCarouselSlide>
}

const StyledCarouselSlides = styled('div')(({ theme }) => ({
  display: 'flex',
  [theme.breakpoints.up('sm')]: {
    flexDirection: 'column',
  },
  scrollSnapType: 'both mandatory',
  overflow: 'auto',
  scrollBehavior: 'smooth',
  flex: 3,

  scrollbarWidth: 'none',

  '&::-webkit-scrollbar': {
    width: 0,
  },
}))

const calcCurrentSlideIndex = ({ containerSize, offset }: { containerSize: number; offset: number }): number => Math.round(offset / containerSize)

export interface CarouselSlidesProps {
  children: ReactNode
}

export const CarouselSlides = ({ children }: CarouselSlidesProps) => {
  const slidesRef = useRef<HTMLDivElement>(null)
  const { setSlidesCount, setSlidesContainerOffset, setCurrentSlideIndex } = useContext(CarouselContext)
  const isColumnView = useMediaQuery((theme: Theme) => theme.breakpoints.up('sm'))

  const slidesCount = React.Children.count(children)

  useEffect(() => {
    setSlidesCount(slidesCount)
  }, [slidesCount, setSlidesCount])

  const throttledHandleScroll = useMemo(
    () =>
      throttle(() => {
        if (!slidesRef.current) {
          return
        }

        const containerSize = isColumnView ? slidesRef.current.clientHeight : slidesRef.current.clientWidth

        const offset = isColumnView ? slidesRef.current.scrollTop : slidesRef.current.scrollLeft

        setCurrentSlideIndex(calcCurrentSlideIndex({ containerSize, offset }))
        setSlidesContainerOffset(isColumnView ? slidesRef.current.scrollTop : slidesRef.current.scrollLeft)
      }, 50),
    [isColumnView, setCurrentSlideIndex, setSlidesContainerOffset],
  )

  return (
    <StyledCarouselSlides ref={slidesRef} onScroll={throttledHandleScroll}>
      {React.Children.toArray(children).map((slideContent, index) => (
        <CarouselSlide key={index} index={index}>
          {slideContent as ReactElement}
        </CarouselSlide>
      ))}
    </StyledCarouselSlides>
  )
}

const StyledCarouselControl = styled('div')(() => ({
  display: 'flex',
  cursor: 'pointer',
}))

export interface CarouselControlProps {
  children: ReactElement
  index?: number
}

export const CarouselControl = ({ children, index }: CarouselControlProps) => {
  const { setScrollToIndex, currentSlideIndex, slidesContainerOffset } = useContext(CarouselContext)

  const handleClick = useCallback(() => {
    if (index === undefined) {
      return
    }
    setScrollToIndex(index)
  }, [index, setScrollToIndex])

  return (
    <StyledCarouselControl onClick={handleClick}>
      {React.cloneElement(children, { isActive: index === currentSlideIndex, offset: slidesContainerOffset })}
    </StyledCarouselControl>
  )
}

const StyledCarouselControls = styled('div')(({ theme }) => ({
  display: 'flex',
  [theme.breakpoints.up('sm')]: {
    flexDirection: 'column',
  },
}))

export interface CarouselControlsProps {
  children: ReactElement[]
}
export const CarouselControls = ({ children }: CarouselControlsProps) => (
  <StyledCarouselControls>
    {React.Children.toArray(children).map((originalChildren, index) => React.cloneElement(originalChildren as ReactElement, { index }))}
  </StyledCarouselControls>
)

const StyledCarousel = styled('div')(({ theme }) => ({
  display: 'flex',
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
  height: '100%',
  flex: 1,
}))

export interface CarouselProps {
  children: ReactNode
  initialSlideIndex?: number
}

export const Carousel = ({ children, initialSlideIndex = 0 }: CarouselProps) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(initialSlideIndex)
  const [slidesCount, setSlidesCount] = useState(0)
  const [scrollToIndex, setScrollToIndex] = useState(0)
  const [isAutoChangeEnabled, setIsAutoChangeEnabled] = useState(true)
  const [slidesContainerOffset, setSlidesContainerOffset] = useState(0)

  const handleMouseOnCarousel = useCallback(() => {
    setIsAutoChangeEnabled(isIntervalEnabled => !isIntervalEnabled)
  }, [])

  useEffect(() => {
    let timerId: NodeJS.Timer
    if (isAutoChangeEnabled) {
      timerId = setInterval(() => {
        setScrollToIndex(index => (index + 1) % slidesCount)
      }, 5000)
    }
    return () => clearInterval(timerId)
  }, [isAutoChangeEnabled, slidesCount])

  const contextValue = useMemo<CarouselContextValue>(
    () => ({
      currentSlideIndex,
      setCurrentSlideIndex,
      slidesCount,
      setSlidesCount,
      slidesContainerOffset,
      setSlidesContainerOffset,
      scrollToIndex,
      setScrollToIndex,
    }),
    [currentSlideIndex, scrollToIndex, slidesContainerOffset, slidesCount],
  )

  return (
    <CarouselContext.Provider value={contextValue}>
      <StyledCarousel onMouseEnter={handleMouseOnCarousel} onMouseLeave={handleMouseOnCarousel}>
        {children}
      </StyledCarousel>
    </CarouselContext.Provider>
  )
}
