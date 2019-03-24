import * as React from 'react'

function useFormValues<Values extends {}>(
  initalValues: Values,
): [Values, (name: string, value: any) => void] {
  const [values, setValues] = React.useState<Values>(initalValues)
  const changeValue = (name: string, value: any) =>
    setValues(prevState => ({
      ...prevState,
      [name]: value,
    }))

  return [values, changeValue]
}

export { useFormValues }
