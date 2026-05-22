import Link from 'next/link'
import { APP_NAME } from '@/lib/constants'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-muted/30">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / App name */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-block">
            <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
          </Link>
          <p className="text-sm text-muted-foreground">Friday Night Race Draw Manager</p>
        </div>

        {children}
      </div>
    </div>
  )
}
