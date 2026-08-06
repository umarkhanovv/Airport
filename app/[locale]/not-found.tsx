import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/** Localised 404, rendered inside the normal site chrome. */
export default function NotFoundPage() {
  const t = useTranslations('NotFound');

  return (
    <div className="max-w-md py-10">
      <p className="text-brand-text-strong text-5xl font-semibold">404</p>
      <h1 className="text-text mt-4 text-2xl font-semibold">{t('title')}</h1>
      <p className="text-text-muted mt-2">{t('description')}</p>
      <Link href="/" className="text-brand-text-strong mt-6 inline-block underline">
        {t('backHome')}
      </Link>
    </div>
  );
}
