import Link from 'next/link';

import { logout } from './login/actions';

/**
 * Admin chrome.
 *
 * Plain `next/link`, not the localised `@/i18n/navigation` wrapper — the admin
 * tree sits outside the locale segment, so the i18n Link would prefix every
 * href with a language and 404.
 */
export function AdminNav({
  current,
  unreadFeedback = 0,
}: {
  current: 'dashboard' | 'schedule' | 'news' | 'documents' | 'feedback';
  unreadFeedback?: number;
}) {
  const linkClass = (active: boolean) =>
    active
      ? 'text-text font-medium'
      : 'text-text-muted hover:text-text hover:bg-surface-sunken rounded-md';

  return (
    <header className="glass-strong sticky top-0 z-30 border-x-0 border-t-0">
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
          <Link href="/admin/news" className={`px-3 py-1.5 ${linkClass(current === 'news')}`}>
            News
          </Link>
          <Link
            href="/admin/documents"
            className={`px-3 py-1.5 ${linkClass(current === 'documents')}`}
          >
            Documents
          </Link>
          <Link
            href="/admin/feedback"
            className={`px-3 py-1.5 ${linkClass(current === 'feedback')}`}
          >
            Feedback
            {unreadFeedback > 0 ? (
              <span
                data-testid="unread-badge"
                className="bg-brand text-on-brand ms-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium"
              >
                {unreadFeedback}
              </span>
            ) : null}
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
