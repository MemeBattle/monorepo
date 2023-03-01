import type { FC } from 'react'

interface ConsCardProps {
  title: string
  cons: string[]
}

export const ConsCard: FC<ConsCardProps> = ({ title, cons }) => (
  <div className="border border-red-200 dark:border-red-900 bg-neutral-50 dark:bg-neutral-900 rounded-xl p-6 my-6 w-full">
    <span>{`You might not use ${title} if...`}</span>
    <div className="mt-4">
      {cons.map(con => (
        <div key={con} className="flex font-medium items-baseline mb-2">
          <div className="h-4 w-4 mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-red-500">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </div>
          <span>{con}</span>
        </div>
      ))}
    </div>
  </div>
)
