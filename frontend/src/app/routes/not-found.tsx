import { Link } from 'react-router'

export function NotFound() {
  return (
    <section className="py-16 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block text-primary underline-offset-4 hover:underline">
        Back to home
      </Link>
    </section>
  )
}
