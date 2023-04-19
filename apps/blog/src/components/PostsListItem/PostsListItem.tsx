import Image from 'next/image'
import { Chip } from '../Chip'
import { ChipsRow } from '../ChipsRow'

type PostsListItemProps = {
  title: string
  summary: string
  imageSrc: string
  imageDescription?: string
  tags?: Array<{ text: string; isActive: boolean }>
  publishedAt: string
}

export function PostsListItem({ title, imageSrc, imageDescription, tags, publishedAt, summary }: PostsListItemProps) {
  return (
    <article className="h-[28rem] sm:h-60 sm:p-6 flex flex-col sm:flex-row rounded-lg shadow overflow-hidden hover:shadow-lg group-focus:shadow-lg transition-shadow">
      <div className="h-48 min-h-[12rem] sm:max-h-0 sm:w-60 overflow-hidden relative">
        <Image fill className="object-cover rounded-lg" src={imageSrc} alt={imageDescription || title} />
      </div>
      <div className="w-full overflow-hidden p-6 sm:p-0 sm:pl-6 flex flex-col">
        <header className="flex flex-col w-full">
          <div className="flex w-full justify-between">
            <time dateTime={publishedAt} className="text-gray-500 text-xs">
              {publishedAt}
            </time>
          </div>
          <h1 className="text-2xl mt-4 mb-2 font-bold hover:underline group-focus:underline group-hover:underline">{title}</h1>
        </header>
        <p className="flex-1 font-light overflow-hidden">{summary}</p>
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
