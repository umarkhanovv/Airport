import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * The airport's HSA monogram plus its name as live text.
 *
 * The legacy site ships a single raster lockup with "Turkistan International
 * Airport" baked in — English only. On a trilingual site that is wrong two
 * times out of three, unselectable, and invisible to search. So the mark
 * (which is language-neutral) is the image, and the name is real text that
 * translates, scales with the accessibility panel, and can be read aloud.
 *
 * #CE7B44 clears the 3:1 non-text threshold on both the white and the twilight
 * surface, so one asset serves both themes with no swap.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Site');

  return (
    <Link href="/" className="group flex items-center gap-3 rounded-sm" aria-label={t('name')}>
      <Image
        src="/brand/hsa-mark.png"
        alt=""
        width={352}
        height={224}
        priority
        className="h-8 w-auto sm:h-9"
      />
      {!compact && (
        <span className="text-text hidden text-[0.95rem] leading-tight font-semibold tracking-tight sm:block">
          {t('shortName')}
        </span>
      )}
    </Link>
  );
}
