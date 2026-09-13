import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from './app/router'
import './app/styles.css'

const rootContainer = document.getElementById('root')

if (!rootContainer) {
  throw new Error('Element #root not found')
}

createRoot(rootContainer).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
