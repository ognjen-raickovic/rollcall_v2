import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'

import { CreateEvent } from '@/app/routes/create-event'
import { EditEvent } from '@/app/routes/edit-event'
import { NotFound } from '@/app/routes/not-found'
import { RootLayout } from '@/app/routes/root-layout'
import { RequireSession } from '@/features/users/components/require-session'

const Home = lazy(() => import('@/app/routes/home').then((module) => ({ default: module.Home })))
const Login = lazy(() => import('@/app/routes/login').then((module) => ({ default: module.Login })))
const Events = lazy(() => import('@/app/routes/events').then((module) => ({ default: module.Events })))
const EventDetailsRoute = lazy(() =>
  import('@/app/routes/event-details').then((module) => ({ default: module.EventDetailsRoute })),
)

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/events', element: <Events /> },
      {
        path: '/events/new',
        element: (
          <RequireSession>
            <CreateEvent />
          </RequireSession>
        ),
      },
      { path: '/events/:eventId', element: <EventDetailsRoute /> },
      {
        path: '/events/:eventId/edit',
        element: (
          <RequireSession>
            <EditEvent />
          </RequireSession>
        ),
      },
      { path: '/login', element: <Login /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
