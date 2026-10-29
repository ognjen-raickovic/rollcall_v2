import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'

import { NotFound } from '@/app/routes/not-found'
import { RootLayout } from '@/app/routes/root-layout'
import { RequireSession } from '@/features/users/components/require-session'
import { RequireAccount } from '@/features/users/components/require-account'
import { demoModeEnabled } from '@/features/users/api/auth-client'
import { AuthError } from '@/features/users/components/auth-error'

const Home = lazy(() => import('@/app/routes/home').then((module) => ({ default: module.Home })))
const About = lazy(() => import('@/app/routes/about').then((module) => ({ default: module.About })))
const Contact = lazy(() =>
  import('@/app/routes/contact').then((module) => ({ default: module.Contact })),
)
const AdministrationRoute = lazy(() =>
  import('@/app/routes/admin').then((module) => ({ default: module.AdministrationRoute })),
)
const Login = lazy(() => import('@/app/routes/login').then((module) => ({ default: module.Login })))
const Register = lazy(() =>
  import('@/app/routes/register').then((module) => ({ default: module.Register })),
)
const ForgotPassword = lazy(() =>
  import('@/app/routes/forgot-password').then((module) => ({ default: module.ForgotPassword })),
)
const ResetPassword = lazy(() =>
  import('@/app/routes/reset-password').then((module) => ({ default: module.ResetPassword })),
)
const AuthCallbackRoute = lazy(() =>
  import('@/app/routes/auth-callback').then((module) => ({ default: module.AuthCallbackRoute })),
)
const Account = lazy(() =>
  import('@/app/routes/account').then((module) => ({ default: module.Account })),
)
const Profile = lazy(() =>
  import('@/app/routes/profile').then((module) => ({ default: module.Profile })),
)
const MyEventsRoute = lazy(() =>
  import('@/app/routes/my-events').then((module) => ({ default: module.MyEventsRoute })),
)
const EditProfile = lazy(() =>
  import('@/app/routes/edit-profile').then((module) => ({ default: module.EditProfile })),
)
const PublicProfileRoute = lazy(() =>
  import('@/app/routes/public-profile').then((module) => ({ default: module.PublicProfileRoute })),
)
const DemoLogin = lazy(() =>
  import('@/app/routes/demo-login').then((module) => ({ default: module.DemoLogin })),
)
const EventBrowser = lazy(() =>
  import('@/app/routes/event-browser').then((module) => ({ default: module.EventBrowser })),
)
const CreateEvent = lazy(() =>
  import('@/app/routes/create-event').then((module) => ({ default: module.CreateEvent })),
)
const EditEvent = lazy(() =>
  import('@/app/routes/edit-event').then((module) => ({ default: module.EditEvent })),
)
const DemoCreateEvent = lazy(() =>
  import('@/app/routes/demo-create-event').then((module) => ({ default: module.DemoCreateEvent })),
)
const DemoEditEvent = lazy(() =>
  import('@/app/routes/demo-edit-event').then((module) => ({ default: module.DemoEditEvent })),
)
const EventDetailsRoute = lazy(() =>
  import('@/app/routes/event-details').then((module) => ({ default: module.EventDetailsRoute })),
)
const DemoEventsRoute = lazy(() =>
  import('@/app/routes/demo-events').then((module) => ({ default: module.DemoEventsRoute })),
)
const DemoEventDetailsRoute = lazy(() =>
  import('@/app/routes/demo-event-details').then((module) => ({
    default: module.DemoEventDetailsRoute,
  })),
)

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/about', element: <About /> },
      { path: '/contact', element: <Contact /> },
      ...['/admin', '/admin/users', '/admin/role-audit', '/admin/reports', '/admin/accounts'].map(
        (path) => ({
          path,
          element: (
            <RequireAccount>
              <AdministrationRoute />
            </RequireAccount>
          ),
        }),
      ),
      {
        path: '/events',
        element: <EventBrowser />,
        children: [
          { index: true, element: null },
          { path: ':eventId', element: <EventDetailsRoute /> },
        ],
      },
      {
        path: '/events/new',
        element: (
          <RequireAccount>
            <CreateEvent />
          </RequireAccount>
        ),
      },
      {
        path: '/events/:eventId/edit',
        element: (
          <RequireAccount>
            <EditEvent />
          </RequireAccount>
        ),
      },
      { path: '/login', element: <Login />, errorElement: <AuthError /> },
      { path: '/register', element: <Register />, errorElement: <AuthError /> },
      { path: '/forgot-password', element: <ForgotPassword />, errorElement: <AuthError /> },
      { path: '/reset-password', element: <ResetPassword />, errorElement: <AuthError /> },
      { path: '/auth/callback', element: <AuthCallbackRoute />, errorElement: <AuthError /> },
      { path: '/account', element: <Account /> },
      {
        path: '/my-events',
        element: (
          <RequireAccount>
            <MyEventsRoute />
          </RequireAccount>
        ),
      },
      {
        path: '/profile',
        element: (
          <RequireAccount>
            <Profile />
          </RequireAccount>
        ),
      },
      {
        path: '/profile/edit',
        element: (
          <RequireAccount>
            <EditProfile />
          </RequireAccount>
        ),
      },
      { path: '/users/:userId', element: <PublicProfileRoute /> },
      ...(demoModeEnabled
        ? [
            { path: '/demo/login', element: <DemoLogin /> },
            { path: '/demo/events', element: <DemoEventsRoute /> },
            {
              path: '/demo/events/new',
              element: (
                <RequireSession>
                  <DemoCreateEvent />
                </RequireSession>
              ),
            },
            { path: '/demo/events/:eventId', element: <DemoEventDetailsRoute /> },
            {
              path: '/demo/events/:eventId/edit',
              element: (
                <RequireSession>
                  <DemoEditEvent />
                </RequireSession>
              ),
            },
          ]
        : []),
      { path: '*', element: <NotFound /> },
    ],
  },
])
