import type { FC } from 'react'

interface ConsCardProps {
  title: string
  cons: string[]
}

export const ConsCard: FC<ConsCardProps> = ({ title, cons }) => (
  <div>
    <span>{`You might not use ${title} if...`}</span>
    <div>
      {cons.map(con => (
        <div key={con}>
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </div>
          <span>{con}</span>
        </div>
      ))}
    </div>
  </div>
)
