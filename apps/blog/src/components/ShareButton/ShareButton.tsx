'use client'

export function ShareButton({ shareData }: { shareData: ShareData }) {
  const handleClick = async () => {
    try {
      await navigator.share(shareData)
    } catch (err) {
      await navigator.clipboard.writeText(shareData.url || window.location.origin)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="relative after:top-1/2 after:left-1/2 after:absolute after:-translate-x-1/2 after:-translate-y-1/2 after:w-[150%] after:h-[150%] transition-colors transition-opacity opacity-30 hover:text-memebattleYellow hover:opacity-100"
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
