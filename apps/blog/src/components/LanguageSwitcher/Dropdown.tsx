'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { Language } from '../../i18n/i18n.settings'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { Route } from 'next'

interface DropdownProps {
  availableLanguages: Array<{ language: Language; label: string }>
  currentLanguage: Language
  children: ReactNode
}

/**
 * Split pathname on segments
 * @example
 * ```
 * splitPathName('/en/posts/some-post-slug') // return ['en', 'posts', 'some-post-slug']
 * ```
 * @param pathname
 * @returns segments
 */
function splitPathname(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/**
 * Join segments and searchParams
 *
 * @example
 * ```
 * createPath(['en', 'posts', 'some-post-slug'], 'search=qwe&tags=typescript') // return '/en/posts/some-post-slug?search=qwe&tags=typescript'
 * ```
 *
 * @param segments
 * @param searchParamsString
 */
function createPath(segments: string[], searchParamsString: string): Route {
  return `/${segments.join('/')}${searchParamsString ? `?${searchParamsString}` : ''}` as Route
}

export function Dropdown({ availableLanguages, currentLanguage, children }: DropdownProps) {
  const pathname = usePathname()

  const searchParams = useSearchParams()

  const links = useMemo(() => {
    const [, ...segments] = splitPathname(pathname)

    const searchParamsString = searchParams.toString()

    return availableLanguages.map(({ language, label }) => ({
      href: createPath([language, ...segments], searchParamsString),
      language,
      label,
    }))
  }, [availableLanguages, pathname, searchParams])

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="bg-white rounded shadow-lg transition-shadow py-3 animate-slideDown">
          {links.map(({ href, language, label }) => (
            <DropdownMenu.Item key={language} disabled={language === currentLanguage}>
              <Link
                prefetch={language !== currentLanguage}
                className="flex py-1 px-5 hover:bg-gray-200 transition-colors aria-disabled:text-gray-500 aria-disabled:cursor-default"
                href={href}
                aria-disabled={language === currentLanguage}
              >
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
