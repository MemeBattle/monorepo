import * as React from 'react'

function useFormInput<T = string>(initalValue: T): [T, (value: T) => void] {
  const [value, setValue] = React.useState<T>(initalValue)

  return [value, setValue]
}

export { useFormInput }
