import { evaluate } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import * as runtime from 'react/jsx-runtime';

import { Link } from '@/i18n/navigation';

/**
 * Renders MDX to HTML on the server.
 *
 * The compiled output ships as plain markup with no client JavaScript, which
 * keeps static pages inside the budget in plan §9.2 — an information page
 * about baggage rules should not cost a React bundle to read.
 *
 * Content is authored in this repository by us, so it is trusted input. If
 * that ever changes — MDX in a database, say — this must be replaced, because
 * MDX compiles to executable code.
 */

/** Prose styling lives here so every migrated page looks the same. */
const components = {
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2 {...props} className="text-text mt-10 mb-3 text-2xl font-semibold tracking-tight" />
  ),
  h3: (props: React.ComponentProps<'h3'>) => (
    <h3 {...props} className="text-text mt-8 mb-2 text-xl font-semibold" />
  ),
  p: (props: React.ComponentProps<'p'>) => <p {...props} className="text-text my-4" />,
  ul: (props: React.ComponentProps<'ul'>) => (
    <ul {...props} className="text-text my-4 list-disc space-y-1.5 ps-6" />
  ),
  ol: (props: React.ComponentProps<'ol'>) => (
    <ol {...props} className="text-text my-4 list-decimal space-y-1.5 ps-6" />
  ),
  strong: (props: React.ComponentProps<'strong'>) => (
    <strong {...props} className="font-semibold" />
  ),
  hr: (props: React.ComponentProps<'hr'>) => (
    <hr {...props} className="border-border my-10 border-t" />
  ),
  blockquote: (props: React.ComponentProps<'blockquote'>) => (
    <blockquote {...props} className="border-brand text-text-muted my-6 border-s-4 ps-4 italic" />
  ),
  /*
    The minimum width is what makes the wrapper's horizontal scroll do
    anything. Left to fill the width, a five-column tariff table on a 375px
    screen compresses until "tenge per tonne MTOW" stacks four words deep in a
    column two centimetres wide. Better to let it keep a readable width and be
    pushed sideways, which is the gesture the scroll container was there for.
  */
  table: (props: React.ComponentProps<'table'>) => (
    <div className="my-6 overflow-x-auto">
      <table {...props} className="w-full min-w-[34rem] border-collapse text-left text-sm" />
    </div>
  ),
  th: (props: React.ComponentProps<'th'>) => (
    <th {...props} className="border-border text-text border-b px-3 py-2 font-semibold" />
  ),
  td: (props: React.ComponentProps<'td'>) => (
    <td {...props} className="border-border text-text border-b px-3 py-2" />
  ),
  a: ({ href = '', ...props }: React.ComponentProps<'a'>) => {
    const external = /^https?:\/\//.test(href);
    if (external) {
      return (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-brand-text-strong underline underline-offset-2"
        />
      );
    }
    // Internal links go through the locale-aware Link so they keep their prefix.
    return (
      <Link
        href={href}
        className="text-brand-text-strong underline underline-offset-2"
        {...(props as Record<string, unknown>)}
      />
    );
  },
};

export async function MdxContent({ source }: { source: string }) {
  const { default: Content } = await evaluate(source, {
    ...runtime,
    /*
     * Tables, which plain MDX does not do — they are a GitHub-flavoured
     * extension. The `table`, `th` and `td` components above were written and
     * styled from the start and had never rendered once: the parser produced
     * no table nodes, so a markdown table came out as a paragraph of pipes.
     * The airport's tariffs are the first genuinely tabular content on the
     * site and are unreadable any other way.
     *
     * Server-side only. `evaluate` runs here and the output ships as plain
     * markup, so this costs the browser nothing.
     */
    remarkPlugins: [remarkGfm],
    development: false,
  });

  return <Content components={components} />;
}
