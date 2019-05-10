export const loadPolyfills = async () => {
  // @ts-ignore
  if (typeof window.IntersectionObserver === 'undefined') {
    // @ts-ignore
    await import('intersection-observer')
  }
}
