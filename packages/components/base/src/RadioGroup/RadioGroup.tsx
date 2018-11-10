import * as React from 'react'
const { Fragment } = React

interface RadioItemProp<T> {
  value: T,
  text: string,
}

interface Props<T> {
  id: string,
  value: T,
  items: RadioItemProp<T>[],
  label: React.ReactNode,
  onChange: (value: T) => any,
}

export const RadioGroup = ({
 id,
 value,
 items,
 label,
 onChange,
}: Props<any>) => {
  return (
    <>
      {items.map(({ value: itemValue, text }) => (
        <Fragment key={itemValue}>
          <label htmlFor={itemValue}>
            {text}
          </label>
          <input
            id={itemValue}
            type='radio'
            checked={itemValue === value}
            onChange={() => onChange(itemValue)}
          />
        </Fragment>
      ))}
    </>
  )
}
