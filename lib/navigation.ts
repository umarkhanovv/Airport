/**
 * The header menu, as the airport wants it.
 *
 * This is a hand-authored structure, not one derived from `SECTIONS`, and the
 * difference is the point. The site's information architecture has seven
 * sections; the airport's *menu* has six items, three of which open a panel of
 * grouped links that cut across those sections — "Упаковка багажа" sits under
 * "В аэропорту" here while its page lives in `passengers/`, and "Безопасность"
 * sits under "О нас" while its page lives in `passengers/` too.
 *
 * Both are correct. Sections are where a page belongs; this is where a visitor
 * looks for it. Reproducing the legacy menu was the client's decision, taken so
 * that people who know the old site do not have to relearn it.
 *
 * Three entries from the legacy menu are deliberately absent, each recorded in
 * the Stage 8 mapping:
 *
 *   - "Карта аэропорта" — two words and a Google Maps iframe; replaced by the
 *     click-to-load location map on Contacts.
 *   - "COVID 19. Информация для пассажиров" — pandemic guidance the spec names
 *     explicitly as content to retire.
 *   - "Галерея" — one word and no images.
 *
 * Every `href` is checked against the content tree by
 * `tests/unit/navigation.test.ts`, so a page renamed or moved breaks the build
 * rather than the menu.
 */

export interface NavLink {
  /** Translation key under the `Menu` namespace. */
  key: string;
  href: string;
}

export interface NavGroup {
  key: string;
  links: NavLink[];
}

export type NavItem =
  | { kind: 'link'; key: string; href: string }
  | { kind: 'menu'; key: string; href: string; groups: NavGroup[] };

/**
 * One board link, not two.
 *
 * The legacy menu had Вылет and Прилёт as separate destinations, and this
 * copied it. They are gone: today's flights now open on the home page, so the
 * direction tabs are the first thing a visitor meets and the menu does not need
 * to duplicate them. What the menu still owes is a way back to the full board —
 * the week view, the search, the workbook download — from any page on the site.
 * That is this one entry.
 */
export const NAVIGATION: NavItem[] = [
  { kind: 'link', key: 'board', href: '/flights' },

  /*
   * News is top-level as well as inside the press panel, and the duplication is
   * deliberate. The panel entry is where someone browsing the press centre
   * looks; this is where someone who just wants to know what has happened
   * looks, and making them open a menu called "Пресс-центр" to find out is a
   * word the airport uses about itself, not one a visitor arrives with.
   *
   * `newsShort` rather than `news` — the panel's label is "Новости аэропорта",
   * which is right in a list of press links and too long for a tab.
   */
  { kind: 'link', key: 'newsShort', href: '/news' },

  {
    kind: 'menu',
    key: 'passengers',
    // The panel's own section index, for the pages the legacy menu never
    // listed — a fifth of the content tree.
    href: '/passengers',
    groups: [
      {
        key: 'atTheAirport',
        links: [
          { key: 'catering', href: '/airport/shops' },
          { key: 'medical', href: '/airport/medical' },
          { key: 'parking', href: '/airport/parking' },
          { key: 'prayerRooms', href: '/airport/prayer-rooms' },
          { key: 'smokingRoom', href: '/airport/smoking-room' },
          { key: 'atm', href: '/airport/atm' },
          { key: 'premium', href: '/airport/premium' },
          { key: 'baggagePacking', href: '/passengers/baggage-packing' },
          { key: 'motherAndChild', href: '/airport/mother-and-child' },
        ],
      },
      {
        key: 'departing',
        links: [
          { key: 'dutyFree', href: '/airport/duty-free' },
          { key: 'animals', href: '/passengers/travelling-with-animals' },
          { key: 'accessibility', href: '/passengers/accessibility' },
          { key: 'customsRules', href: '/passengers/customs-rules' },
          { key: 'passportControl', href: '/passengers/passport-control' },
        ],
      },
      {
        key: 'arriving',
        links: [
          { key: 'baggageTracing', href: '/passengers/baggage-tracing' },
          { key: 'visitTurkistan', href: '/passengers/visit-turkistan' },
        ],
      },
      {
        key: 'flightInformation',
        links: [
          { key: 'checkIn', href: '/passengers/check-in' },
          { key: 'informationDesk', href: '/airport/information-desk' },
        ],
      },
    ],
  },

  {
    kind: 'menu',
    key: 'partners',
    href: '/partners',
    groups: [
      {
        key: 'procurement',
        links: [
          { key: 'bankDetails', href: '/about/bank-details' },
          { key: 'quotationPurchases', href: '/partners/quotation-purchases' },
          { key: 'seasonalSchedule', href: '/flights/statistics' },
        ],
      },
      {
        key: 'airportServices',
        links: [
          { key: 'advertising', href: '/partners/advertising' },
          { key: 'announcements', href: '/press/announcements' },
          { key: 'tariffs', href: '/flights/cargo' },
        ],
      },
      {
        key: 'aboutUs',
        links: [
          { key: 'history', href: '/about/history' },
          { key: 'overview', href: '/airport/overview' },
          { key: 'security', href: '/passengers/security' },
          { key: 'standards', href: '/about/standards' },
          { key: 'codeOfConduct', href: '/about/code-of-conduct' },
          { key: 'legalAndBank', href: '/about/bank-details' },
        ],
      },
    ],
  },

  {
    kind: 'menu',
    key: 'press',
    href: '/press',
    groups: [
      {
        key: 'pressCentre',
        links: [
          { key: 'vacancies', href: '/about/vacancies' },
          { key: 'news', href: '/news' },
        ],
      },
    ],
  },

  { kind: 'link', key: 'feedback', href: '/contacts' },
];

/** Every content path the menu points at, for the test that keeps it honest. */
export function navigationHrefs(): string[] {
  return NAVIGATION.flatMap((item) =>
    item.kind === 'link'
      ? [item.href]
      : [item.href, ...item.groups.flatMap((group) => group.links.map((link) => link.href))]
  );
}
