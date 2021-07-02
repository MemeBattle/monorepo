/**
 * Return full path
 * @param path - relative path to static file
 */
export const buildCasStaticUrl = (path: string) => `${process.env.REACT_APP_CAS_STATIC}${path}`
