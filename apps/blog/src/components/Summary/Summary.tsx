export function Summary({ children }: React.PropsWithChildren) {
  return (
    <summary className="p-6 text-xl flex items-center gap-6 list-none font-semibold">
      <svg width="10" height="17" viewBox="0 0 10 17" fill="none" className="group-open:rotate-90" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.25 1.25L8.75 8.75L1.25 16.25" stroke="#676E76" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </summary>
  )
}
