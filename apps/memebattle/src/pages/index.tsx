import React from 'react'
import {
  Box,
  Input,
  Textarea,
  RadioGroup,
  CheckBox,
} from '@components/base'

const App = () => {
  return (
        <>
            <Input
                id='1'
                value=''
                type='text'
                placeholder='input'
                label={
                    <Box tag='div' className='qwewqe'/>
                }
                onInput={value => console.log(value)}
            />
            <Textarea
                id='2'
                value=''
                placeholder='textarea'
                label={
                    <Box tag='div' />
                }
                onInput={value => console.log(value)}
            />
            <CheckBox
              id='3'
              value={false}
              label={
                <Box tag='div' />
              }

              onChange={value => console.log(value)}
            />
            <Box tag='div' />
            <RadioGroup
              id='4'
              value='333'
              items={[
                { value: '333', text: '333' },
                { value: '3333', text: '333333' },
                { value: '333333', text: '111111' },
              ]}
              label={123123}
              onChange={(value) => console.log(value)}
            />
            <Box
              tag='div'
            >
              qweqwewq
            </Box>
            <Box
              tag='header'
            >
              qweqwewq
            </Box>
        </>
  )
}

export default App
