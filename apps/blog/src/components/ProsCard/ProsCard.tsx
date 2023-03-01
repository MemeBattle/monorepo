import type { FC } from 'react'

interface ProsCardProps {
  title: string
  pros: string[]
}

export const ProsCard: FC<ProsCardProps> = ({ title, pros }) => (
  <div className="border border-emerald-200 dark:border-emerald-900 bg-neutral-50 dark:bg-neutral-900 rounded-xl p-6 my-4 w-full">
    <span>{`You might use ${title} if...`}</span>
    <div className="mt-4">
      {pros.map(pro => (
        <div key={pro} className="flex font-medium items-baseline mb-2">
          <div className="h-4 w-4 mr-2">
            <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24">
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </g>
            </svg>
          </div>
          <span>{pro}</span>
        </div>
      ))}
    </div>
  </div>
)
