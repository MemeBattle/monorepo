export function generateFullUrl(relativePath = ''): string {
  return `${process.env.APP_HOST_URL || 'https://blog.mems.fun'}${relativePath}`
}
