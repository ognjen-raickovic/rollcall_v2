import { createBrowserRouter } from 'react-router'

import { Home } from '@/app/routes/home'
import { CreateEvent } from '@/app/routes/create-event'
import { EditEvent } from '@/app/routes/edit-event'
import { EventDetailsRoute } from '@/app/routes/event-details'
import { Events } from '@/app/routes/events'
import { Login } from '@/app/routes/login'
import { NotFound } from '@/app/routes/not-found'
import { AppLayout } from '@/components/layout/app-layout'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/events', element: <Events /> },
      { path: '/events/new', element: <CreateEvent /> },
      { path: '/events/:eventId', element: <EventDetailsRoute /> },
      { path: '/events/:eventId/edit', element: <EditEvent /> },
      { path: '/login', element: <Login /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
