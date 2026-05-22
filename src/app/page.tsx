import Link from 'next/link'
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from '@/lib/constants'

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen">
      {/* Hero section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground border border-border rounded-full px-4 py-1.5 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Automated draw system
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            {APP_NAME}
          </h1>

          <p className="text-xl text-muted-foreground font-medium">
            {APP_TAGLINE}
          </p>

          <p className="text-muted-foreground max-w-xl mx-auto">
            {APP_DESCRIPTION}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features section */}
      <section className="border-t bg-muted/30 px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center space-y-2">
              <div className="text-3xl mb-3">📋</div>
              <h3 className="font-semibold">Register for Races</h3>
              <p className="text-sm text-muted-foreground">
                Sign up as a helm or crew for upcoming Friday night races. Register for a single
                race or the entire season at once.
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="text-3xl mb-3">🎲</div>
              <h3 className="font-semibold">Automated Draw</h3>
              <p className="text-sm text-muted-foreground">
                Every Wednesday at 7 PM, the system automatically pairs helms with crew. Higher
                overflow priority sailors get first pick.
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="text-3xl mb-3">⛵</div>
              <h3 className="font-semibold">Go Racing</h3>
              <p className="text-sm text-muted-foreground">
                Get emailed your pairing results. If you miss out, you earn priority for the
                next draw automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Club search section placeholder */}
      <section className="border-t px-4 py-16">
        <div className="max-w-xl mx-auto text-center space-y-4">
          <h2 className="text-2xl font-bold">Find Your Club</h2>
          <p className="text-muted-foreground">
            Search for your sailing club to join or view upcoming race dates.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Browse Clubs
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
        <p>
          {APP_NAME} &copy; {new Date().getFullYear()}.{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
        </p>
      </footer>
    </main>
  )
}
