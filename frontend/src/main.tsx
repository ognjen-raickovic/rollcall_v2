import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'

import { Providers } from '@/app/providers'
import { router } from '@/app/router'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root in index.html')

createRoot(root).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
