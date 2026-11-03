import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const reviews = defineCollection({
  loader: glob({ pattern: '**/[^_]*.mdx', base: './src/content/reviews' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      excerpt: z.string(),
      cover: image().optional(),
      category: z.string(),
      funding: z.enum(['self', 'sponsor']).default('self'),
      sponsor: z.string().optional(),
      brand: z.string(),
      price: z.number().nonnegative(),
      rating: z.number().min(0).max(10),
      pros: z.array(z.string()).default([]),
      cons: z.array(z.string()).default([]),
      specs: z
        .array(z.object({ label: z.string(), value: z.string() }))
        .default([]),
      author: z.string(),
      publishedAt: z.coerce.date(),
      featured: z.boolean().default(false),
    }),
});

const categories = defineCollection({
  loader: glob({ pattern: '**/[^_]*.yaml', base: './src/content/categories' }),
  schema: z.object({
    name: z.string(),
    parent: z.string().nullish(),
    description: z.string().optional(),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '**/[^_]*.yaml', base: './src/content/authors' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      bio: z.string(),
      avatar: image().optional(),
      url: z.url().optional(),
      email: z.email().optional(),
    }),
});

export const collections = { reviews, categories, authors };
