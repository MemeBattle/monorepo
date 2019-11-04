import React from 'react'

interface Avatar {
  src: string
}

const Avatar: React.FC<Avatar> = ({ src }) => <img src={src} />
