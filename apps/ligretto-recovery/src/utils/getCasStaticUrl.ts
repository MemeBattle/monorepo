/**
 * Return full path or undefined
 * @param path - relative path to static file
 */
export const getCasStaticUrl = (path: string | undefined) => (path ? `${process.env.REACT_APP_CAS_STATIC}${path}` : undefined)
