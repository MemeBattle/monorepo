export const ensureArray = <T>(value: T | T[] | undefined | null): T[] | undefined => {
  if (value == null) {
    return undefined
  }
  return Array.isArray(value) ? value : [value]
}
