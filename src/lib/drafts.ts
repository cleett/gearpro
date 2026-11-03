import type { CollectionEntry } from 'astro:content';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;

export interface DraftInput {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  brand: string;
  price: number;
  rating: number;
  pros: string[];
  cons: string[];
  specs: { label: string; value: string }[];
  content: string;
  coverR2Key?: string | null;
}

export interface DraftRow {
  id: number;
  author: string;
  author_name: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  brand: string;
  price: number;
  rating: number;
  pros: string;
  cons: string;
  specs: string;
  content: string;
  cover_r2_key: string | null;
  status: 'pending' | 'published' | 'rejected';
  review_note: string | null;
  commit_sha: string | null;
  updated_at: string;
}

export function yamlStr(s: string): string {
  return JSON.stringify(s);
}

function toLines(value: unknown, max: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .slice(0, max)
    .map((v) => v.slice(0, maxLen));
}

export function parseDraftInput(raw: Record<string, unknown>): {
  ok: true;
  value: DraftInput;
} {
  const title = String(raw.title ?? '').trim();
  const slug = String(raw.slug ?? '').trim();
  const excerpt = String(raw.excerpt ?? '').trim();
  const category = String(raw.category ?? '').trim();
  const brand = String(raw.brand ?? '').trim();
  const price = Math.round(Number(raw.price ?? 0));
  const rating = Number(raw.rating ?? 0);
  const content = String(raw.content ?? '').replace(/\r\n/g, '\n').trim();
  const coverR2Key = raw.coverR2Key ? String(raw.coverR2Key) : null;

  if (!title || title.length > 80) throw new Error('bad_title');
  if (!SLUG_RE.test(slug)) throw new Error('bad_slug');
  if (!excerpt || excerpt.length > 240) throw new Error('bad_excerpt');
  if (!brand || brand.length > 40) throw new Error('bad_brand');
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) throw new Error('bad_price');
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) throw new Error('bad_rating');
  if (content.length < 50 || content.length > 30_000) throw new Error('bad_content');
  if (coverR2Key && !/^drafts\/[a-z0-9-]+\/[a-f0-9-]{36}\.(jpe?g|png|webp)$/.test(coverR2Key)) {
    throw new Error('bad_cover');
  }

  return {
    ok: true,
    value: {
      title,
      slug,
      excerpt,
      category,
      brand,
      price,
      rating: Math.round(rating * 10) / 10,
      pros: toLines(raw.pros, 10, 120),
      cons: toLines(raw.cons, 10, 120),
      specs: Array.isArray(raw.specs)
        ? (raw.specs as unknown[])
            .slice(0, 15)
            .map((s) => {
              const o = (s ?? {}) as { label?: unknown; value?: unknown };
              return { label: String(o.label ?? '').trim().slice(0, 40), value: String(o.value ?? '').trim().slice(0, 80) };
            })
            .filter((s) => s.label && s.value)
        : [],
      content,
      coverR2Key,
    },
  };
}

export function buildReviewMdx(
  draft: DraftInput,
  author: string,
  coverExt: string | null,
): string {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const cover = coverExt ? `cover: ${yamlStr(`@assets/covers/${draft.slug}/cover.${coverExt}`)}\n` : '';
  const frontmatter = [
    '---',
    `title: ${yamlStr(draft.title)}`,
    `excerpt: ${yamlStr(draft.excerpt)}`,
    cover,
    `category: ${draft.category}`,
    `brand: ${yamlStr(draft.brand)}`,
    `price: ${draft.price}`,
    `rating: ${draft.rating}`,
    `pros: ${JSON.stringify(draft.pros)}`,
    `cons: ${JSON.stringify(draft.cons)}`,
    `specs: ${JSON.stringify(draft.specs)}`,
    `author: ${author}`,
    `publishedAt: ${today}`,
    'featured: false',
    'funding: self',
    '---',
    '',
    draft.content,
    '',
  ];
  return frontmatter.join('\n');
}

export function categoryName(
  categories: CollectionEntry<'categories'>[],
  slug: string,
): string {
  const entry = categories.find((c) => c.id === slug);
  if (!entry) return slug;
  const parent = entry.data.parent
    ? categories.find((c) => c.id === entry.data.parent)
    : undefined;
  return parent ? `${parent.data.name} · ${entry.data.name}` : entry.data.name;
}
