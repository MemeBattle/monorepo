import type { ComponentProps, ReactNode } from 'react'

export type IconName = 'key' | 'plus' | 'pencil' | 'trash' | 'mail' | 'alert' | 'check' | 'logout' | 'shield'

const shapes: Record<IconName, ReactNode> = {
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.9 12.1 19 4" />
      <path d="M16 7l2 2" />
      <path d="M13 10l2 2" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
}

export const iconNames = Object.keys(shapes) as IconName[]

interface IconProps extends Omit<ComponentProps<'svg'>, 'name'> {
  name: IconName
  size?: number
}

/** Stroke icons on a 24px grid; they take the text colour and are decorative. */
export const Icon = ({ name, size = 20, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0"
    {...rest}
  >
    {shapes[name]}
  </svg>
)
