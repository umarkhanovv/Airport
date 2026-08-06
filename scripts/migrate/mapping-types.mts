/**
 * The shape of the Stage 8 mapping (plan §8 step 2).
 *
 * The types live here, in the repository; the decisions themselves live in
 * `migration/mapping.mts`, which does not. That table records why each legacy
 * page was migrated, merged or dropped, and those reasons are an assessment of
 * the client's existing site rather than project documentation.
 *
 * Splitting them keeps the tooling typechecked on a clean clone: the scripts
 * load the data with a runtime import and type it against these declarations,
 * so `tsc` never needs the private file to be present.
 */

/** The seven sections of the new IA (spec §5). */
export type Section = 'flights' | 'airport' | 'passengers' | 'about' | 'partners' | 'press';

export type Decision =
  /**
   * Becomes an MDX page at `path`.
   *
   * `note` is the rationale for the decision and stays in the reconciliation
   * table. `proofread` is a neutral, actionable instruction that travels into
   * the generated page's frontmatter and ships with the repository — so it
   * states what needs doing, not what is wrong with the client's site.
   */
  | { action: 'migrate'; section: Section; path: string; note?: string; proofread?: string }
  /** Content folded into another legacy slug's page. */
  | { action: 'merge'; into: string; note: string }
  /** Superseded by something this rebuild already ships. */
  | { action: 'replace'; by: string; note: string }
  /** Not migrated. */
  | { action: 'drop'; reason: string };

/** Keyed by legacy slug with the locale prefix removed. */
export type Mapping = Record<string, Decision>;

/**
 * Legacy slugs that exist only in English and Kazakh, each naming the page it
 * belongs to. Some carry more content than their Russian counterpart.
 */
export type Aliases = Record<string, { into: string; note: string }>;

export interface MappingModule {
  MAPPING: Mapping;
  ALIASES: Aliases;
}
