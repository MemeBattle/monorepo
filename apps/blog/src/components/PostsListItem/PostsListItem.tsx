import Link from 'next/link'
import Image from 'next/image'
import type { Route } from 'next'
import { Chip } from '../Chip'
import { ChipsRow } from '../ChipsRow'
import { Suspense } from 'react'
import { ShareButton } from '../ShareButton'

type PostsListItemProps = {
  title: string
  summary: string
  imageSrc: string
  imageDescription?: string
  tags?: Array<{ text: string; isActive: boolean }>
  publishedAt: string
  postUrl: Route
}

export function PostsListItem({ title, imageSrc, imageDescription, tags, publishedAt, summary, postUrl }: PostsListItemProps) {
  return (
    <article className="h-[28rem] sm:h-60 sm:p-6 flex flex-col sm:flex-row rounded shadow-slate-200 border overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-48 min-h-[12rem] sm:max-h-0 sm:w-60 overflow-hidden relative">
        <Link href={postUrl}>
          <Image fill className="object-cover" src={imageSrc} alt={imageDescription || title} />
        </Link>
      </div>
      <div className="w-full overflow-hidden p-6 sm:p-0 sm:pl-6 flex flex-col">
        <header className="flex flex-col w-full">
          <div className="flex w-full justify-between">
            <time dateTime={publishedAt} className="text-blue-500 text-xs">
              {publishedAt}
            </time>
            <div className="flex">
              <Suspense>
                <ShareButton shareData={{ url: postUrl, title }} />
              </Suspense>
              {/*<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none">*/}
              {/*  <path*/}
              {/*    stroke="currentColor"*/}
              {/*    strokeLinecap="round"*/}
              {/*    strokeLinejoin="round"*/}
              {/*    d="m11.53 16.864 7.597-7.597c1.867-1.866 2.142-4.937.376-6.899a4.875 4.875 0 0 0-7.075-.19L11 3.606 9.767 2.373C7.901.506 4.83.23 2.868 1.997a4.875 4.875 0 0 0-.19 7.075l7.792 7.792a.75.75 0 0 0 1.06 0v0Z"*/}
              {/*  />*/}
              {/*</svg>*/}
            </div>
          </div>
          <Link href={postUrl}>
            <h1 className="text-2xl mt-4 mb-3 font-bold hover:underline">{title}</h1>
          </Link>
        </header>
        <Link className="flex-1 font-light overflow-hidden" href={postUrl}>
          <p>{summary}</p>
        </Link>
        {tags ? (
          <footer className="pt-1">
            <ChipsRow>
              {tags.map(({ text, isActive }, index) => (
                <Chip key={index} isActive={isActive}>
                  {text}
                </Chip>
              ))}
            </ChipsRow>
          </footer>
        ) : null}
      </div>
    </article>
  )
}
