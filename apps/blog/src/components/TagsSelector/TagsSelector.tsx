'use client'

import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { ChipsRow } from '../ChipsRow'
import { Chip } from '../Chip'
import type { MouseEvent } from 'react'
import { useCallback } from 'react'

interface TagsSelectorProps {
  tags: string[]
}

export function TagsSelector({ tags }: TagsSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const queriedTags = searchParams.getAll('tags')

  const createQueryString = useCallback(
    (name: string, value: string) => {
      let currentTags = searchParams.getAll('tags')

      if (currentTags.includes(value)) {
        currentTags = currentTags.filter(currentTag => currentTag !== value)
      } else {
        currentTags = currentTags.concat(value)
      }

      const newSearchParams = new URLSearchParams(searchParams)

      newSearchParams.delete('tags')

      currentTags.forEach(tag => {
        newSearchParams.append('tags', tag)
      })

      return newSearchParams.toString()
    },
    [searchParams],
  )

  const handleChipClick = useCallback<(event: MouseEvent<HTMLDivElement>, value: string) => void>(
    (_, value) => {
      router.push(pathname + '?' + createQueryString('tags', value))
    },
    [createQueryString, pathname, router],
  )

  return (
    <ChipsRow>
      {tags.map(tag => (
        <Chip key={tag} onClick={handleChipClick} isActive={queriedTags.includes(tag)}>
          {tag}
        </Chip>
      ))}
    </ChipsRow>
  )
}
