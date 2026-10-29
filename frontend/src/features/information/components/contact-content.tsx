import { Mail, MessageSquare, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router'
import { BackLink } from '@/components/back-link'
import { Button } from '@/components/ui/button'
import { publicSupportEmail } from '../contact-config'

export function ContactContent() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4 md:space-y-12 md:py-8">
      <BackLink to="/">Back to discovery</BackLink>
      <header className="max-w-2xl space-y-4">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">Keep in touch</p>
        <h1 className="text-3xl font-bold tracking-tight">Contact Us</h1>
        <p className="leading-relaxed text-muted-foreground">
          Have a question, an idea for RollCall or a problem to share? Here is where to find our contact
          options and guidance.
        </p>
      </header>
      <section
        aria-labelledby="questions-feedback"
        className="space-y-4 rounded-xl border bg-card p-6 md:p-8"
      >
        <MessageSquare className="size-6 text-primary" aria-hidden="true" />
        <h2 id="questions-feedback" className="text-xl font-semibold">
          Questions, feedback &amp; technical issues
        </h2>
        {publicSupportEmail ? (
          <>
            <p className="max-w-2xl leading-relaxed text-muted-foreground">
              Send a short description of your question or feedback. For a technical issue, include the
              page, what you expected and what happened.
            </p>
            <Button asChild>
              <a href={`mailto:${publicSupportEmail}`}>
                <Mail aria-hidden="true" />
                {publicSupportEmail}
              </a>
            </Button>
          </>
        ) : (
          <p className="max-w-2xl leading-relaxed text-muted-foreground">
            Email support is not available yet. A public contact address will appear here once it is
            ready. This page cannot currently send or receive messages.
          </p>
        )}
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Never share passwords, login links, authentication tokens or private account details in a
          report or screenshot.
        </p>
      </section>
      <section
        aria-labelledby="report-an-event"
        className="space-y-4 rounded-xl border bg-card p-6 md:p-8"
      >
        <ShieldAlert className="size-6 text-primary" aria-hidden="true" />
        <h2 id="report-an-event" className="text-xl font-semibold">
          Concerned about an event?
        </h2>
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          For an event-related concern, open the event and use “Report this event” when available.
          Reporting requires an active account and access to that event.
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {publicSupportEmail
            ? 'For a general platform problem, email support using the address above.'
            : 'For a general platform problem, use the contact option above when it becomes available.'}{' '}
          An event report is for concerns about that event.
        </p>
        <Button asChild variant="outline">
          <Link to="/events">Explore events</Link>
        </Button>
      </section>
    </div>
  )
}
