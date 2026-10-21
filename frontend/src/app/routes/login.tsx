import { Link } from 'react-router'

export function Login() {
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Log in</h1>
      <p className="text-muted-foreground">
        Login is planned for a later workshop. You can browse sample events without an account.
      </p>
      <Link
        to="/events"
        className="inline-block text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Browse events
      </Link>
    </section>
  )
}
