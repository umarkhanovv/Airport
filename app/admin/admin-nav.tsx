import Link from 'next/link';

import { logout } from './login/actions';

/**
 * Admin chrome.
 *
 * Plain `next/link`, not the localised `@/i18n/navigation` wrapper — the admin
 * tree sits outside the locale segment, so the i18n Link would prefix every
 * href with a language and 404.
 */
export function AdminNav({ current }: { current: 'dashboard' | 'schedule' }) {
  const linkClass = (active: boolean) =>
    active
      ? 'text-text font-medium'
      : 'text-text-muted hover:text-text hover:bg-surface-sunken rounded-md';

  return (
    <header className="border-border bg-surface border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
        <span className="font-semibold">Airport admin</span>

        <nav aria-label="Admin sections" className="flex items-center gap-1 text-sm">
          <Link href="/admin" className={`px-3 py-1.5 ${linkClass(current === 'dashboard')}`}>
            Overview
          </Link>
          <Link
            href="/admin/schedule"
            className={`px-3 py-1.5 ${linkClass(current === 'schedule')}`}
          >
            Schedule
          </Link>
        </nav>

        <form action={logout} className="ms-auto">
          <button
            type="submit"
            className="text-text-muted hover:text-text focus:ring-focus rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
