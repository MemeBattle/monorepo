'use client'

export function ShareButton({ shareData }: { shareData: ShareData }) {
  const handleClick = async () => {
    try {
      if (!navigator.share) {
        console.log('!!!')
        await navigator.clipboard.writeText(shareData.url || shareData.text || shareData.title || '')
        // window.alert('Copied to clipboard')
      } else {
        await navigator.share(shareData)
        console.log('SHARED')
      }
    } catch (error: unknown) {
      const err = error as Error
      if (err.name === 'AbortError') {
        return
      }
    }
  }

  return (
    <button
      onClick={handleClick}
      className="relative after:top-1/2 after:left-1/2 after:absolute after:-translate-x-1/2 after:-translate-y-1/2 w-[150%] h-[150%] transition-colors transition-opacity opacity-30 hover:text-memebattleYellow hover:opacity-100"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none">
        <path
          stroke="currentColor"
          d="m6.523 12.622 5.454 3.506m0-10.256L6.523 9.378M17.5 17.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10.5-6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
    </button>
  )
}
