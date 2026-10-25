import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'

import { NotFound } from '@/app/routes/not-found'
import { RootLayout } from '@/app/routes/root-layout'
import { RequireSession } from '@/features/users/components/require-session'
import { demoModeEnabled } from '@/features/users/api/auth-client'

const Home = lazy(() => import('@/app/routes/home').then((module) => ({ default: module.Home })))
const Login = lazy(() => import('@/app/routes/login').then((module) => ({ default: module.Login })))
const Register = lazy(() => import('@/app/routes/register').then((module) => ({ default: module.Register })))
const ForgotPassword = lazy(() =>
  import('@/app/routes/forgot-password').then((module) => ({ default: module.ForgotPassword })),
)
const ResetPassword = lazy(() =>
  import('@/app/routes/reset-password').then((module) => ({ default: module.ResetPassword })),
)
const AuthCallbackRoute = lazy(() =>
  import('@/app/routes/auth-callback').then((module) => ({ default: module.AuthCallbackRoute })),
)
const Account = lazy(() => import('@/app/routes/account').then((module) => ({ default: module.Account })))
const DemoLogin = lazy(() =>
  import('@/app/routes/demo-login').then((module) => ({ default: module.DemoLogin })),
)
const Events = lazy(() => import('@/app/routes/events').then((module) => ({ default: module.Events })))
const CreateEvent = lazy(() =>
  import('@/app/routes/create-event').then((module) => ({ default: module.CreateEvent })),
)
const EditEvent = lazy(() =>
  import('@/app/routes/edit-event').then((module) => ({ default: module.EditEvent })),
)
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
      { path: '/register', element: <Register /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/auth/callback', element: <AuthCallbackRoute /> },
      { path: '/account', element: <Account /> },
      ...(demoModeEnabled ? [{ path: '/demo/login', element: <DemoLogin /> }] : []),
      { path: '*', element: <NotFound /> },
    ],
  },
])
