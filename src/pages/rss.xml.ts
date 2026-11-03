import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

import { buildTaxonomy, byDateDesc } from '../lib/taxonomy';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '../lib/site';

export async function GET(context: APIContext) {
  const reviews = (await getCollection('reviews')).sort(byDateDesc);
  const taxonomy = buildTaxonomy(await getCollection('categories'));

  return rss({
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    site: context.site!,
    items: reviews.map((review) => ({
      title: `${review.data.brand} ${review.data.title}`,
      description: review.data.excerpt,
      pubDate: review.data.publishedAt,
      categories: [taxonomy.labelOf(review.data.category)],
      link: `/reviews/${review.id}/`,
    })),
    customData: '<language>ko</language>',
  });
}
