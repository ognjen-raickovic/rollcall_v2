import { createBrowserRouter } from 'react-router'

import { Home } from '@/app/routes/home'
import { Listings } from '@/app/routes/listings'
import { NotFound } from '@/app/routes/not-found'
import { AppLayout } from '@/components/layout/app-layout'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/listings', element: <Listings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
