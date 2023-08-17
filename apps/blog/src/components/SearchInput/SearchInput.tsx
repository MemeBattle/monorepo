'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ChangeEventHandler } from 'react'
import { useCallback } from 'react'
interface SearchInputProps {
  placeholder: string
}

export function SearchInput({ placeholder }: SearchInputProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSearchChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    ({ target }) => {
      const newSearchParams = new URLSearchParams(searchParams)

      if (!target.value) {
        newSearchParams.delete('search')
      } else {
        newSearchParams.set('search', target.value)
      }

      router.push(`?${newSearchParams.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="relative rounded-lg shadow-sm">
      <input
        onChange={handleSearchChange}
        type="text"
        name="search"
        className="block w-full rounded-lg border-0 py-5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 sm:pl-6 sm:pr-12"
        placeholder={placeholder}
        defaultValue={searchParams.get('search') || undefined}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 sm:pr-6">
        <span className="text-gray-500 sm:text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
            <path stroke="currentColor" d="M14.443 14.444 19 19M16.75 8.875a7.875 7.875 0 1 1-15.75 0 7.875 7.875 0 0 1 15.75 0Z" />
          </svg>
        </span>
      </div>
    </div>
  )
}
