/**
 * Return full path
 * @param path - relative path to static file
 */
export const buildCasStaticUrl = (path: string) => `${import.meta.env.VITE_CAS_STATIC}${path}`
