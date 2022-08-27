import { CAS_STATIC_URL } from 'config'

/**
 * Return full path
 * @param path - relative path to static file
 */
export const buildCasStaticUrl = (path: string) => `${CAS_STATIC_URL}${path}`
