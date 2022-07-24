import { createContext } from 'react'

export interface CarouselContextValue {
  currentSlideIndex: number
  setCurrentSlideIndex: (index: number) => void
  setSlidesCount: (count: number) => void
  slidesCount: number
  slidesContainerOffset: number
  setSlidesContainerOffset: (offset: number) => void
  scrollToIndex: number
  setScrollToIndex: (index: number) => void
}

export const CarouselContext = createContext<CarouselContextValue>({
  currentSlideIndex: 0,
  slidesCount: 0,
  slidesContainerOffset: 0,
  scrollToIndex: 0,
  setCurrentSlideIndex: () => undefined,
  setSlidesCount: () => undefined,
  setSlidesContainerOffset: () => undefined,
  setScrollToIndex: () => undefined,
})
