/**
 * Pass-through root layout.
 *
 * The real root layout — the one that renders <html> — is
 * `app/[locale]/layout.tsx`, because the language attribute depends on the
 * locale segment. Next.js still requires a layout at the top of `app/` once
 * `app/not-found.tsx` exists, so this exists purely to satisfy that and adds
 * no markup of its own.
 */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return children;
}
