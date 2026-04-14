declare module '*.png' {
  const content: import('next/dist/shared/lib/image-external').StaticImageData
  export default content
}

declare module '*.svg' {
  const content: any
  export default content
}
