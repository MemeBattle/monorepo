import type { FC } from 'react'

interface ProsCardProps {
  title: string
  pros: string[]
}

export const ProsCard: FC<ProsCardProps> = ({ title, pros }) => (
  <div>
    <span>{`You might use ${title} if...`}</span>
    <div>
      {pros.map(pro => (
        <div key={pro}>
          <div>
            <svg viewBox="0 0 24 24">
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
