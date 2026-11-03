import type { CollectionEntry } from 'astro:content';

export type CategoryEntry = CollectionEntry<'categories'>;

export interface Taxonomy {
  bySlug: Map<string, CategoryEntry>;
  childrenOf: Map<string, string[]>;
  topLevel: CategoryEntry[];
  nameOf(slug: string): string;
  labelOf(slug: string): string;
  breadcrumb(slug: string): { slug: string; name: string }[];
  descendants(slug: string): string[];
}

export function buildTaxonomy(categories: CategoryEntry[]): Taxonomy {
  const bySlug = new Map(categories.map((c) => [c.id, c]));

  const childrenOf = new Map<string, string[]>();
  for (const c of categories) {
    const parent = c.data.parent ?? undefined;
    if (!parent) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(c.id);
    childrenOf.set(parent, list);
  }

  const topLevel = categories
    .filter((c) => !c.data.parent)
    .sort((a, b) => a.data.name.localeCompare(b.data.name, 'ko'));

  const nameOf = (slug: string) => bySlug.get(slug)?.data.name ?? slug;

  return {
    bySlug,
    childrenOf,
    topLevel,
    nameOf,
    labelOf(slug: string) {
      const entry = bySlug.get(slug);
      if (!entry) return slug;
      const parent = entry.data.parent ? bySlug.get(entry.data.parent) : undefined;
      return parent ? `${parent.data.name} · ${entry.data.name}` : entry.data.name;
    },
    breadcrumb(slug: string) {
      const chain: { slug: string; name: string }[] = [];
      let current: string | undefined = slug;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        seen.add(current);
        const entry = bySlug.get(current);
        if (!entry) break;
        chain.unshift({ slug: current, name: entry.data.name });
        current = entry.data.parent ?? undefined;
      }
      return chain;
    },
    descendants(slug: string) {
      const out: string[] = [];
      const stack = [...(childrenOf.get(slug) ?? [])];
      while (stack.length) {
        const s = stack.pop() as string;
        out.push(s);
        stack.push(...(childrenOf.get(s) ?? []));
      }
      return out;
    },
  };
}

export function byRatingDesc(
  a: CollectionEntry<'reviews'>,
  b: CollectionEntry<'reviews'>,
): number {
  return (
    b.data.rating - a.data.rating ||
    b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf()
  );
}

export function byDateDesc(
  a: CollectionEntry<'reviews'>,
  b: CollectionEntry<'reviews'>,
): number {
  return b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();
}
