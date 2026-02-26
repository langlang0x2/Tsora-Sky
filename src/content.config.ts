import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'

function removeDupsAndLowerCase(array: string[]) {
  if (!array.length) return array
  const lowercaseItems = array.map((str) => str.toLowerCase())
  const distinctItems = new Set(lowercaseItems)
  return Array.from(distinctItems)
}

// Define blog collection
const blog = defineCollection({
  // Load Markdown and MDX files in the `src/content/blog/` directory.
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  // Required
  schema: ({ image }) =>
    z.object({
      // Required
      title: z.string().max(60),
      description: z.string().max(160),
      publishDate: z.coerce.date(),
      // Optional
      updatedDate: z.coerce.date().optional(),
      heroImage: z
        .object({
          src: image(),
          alt: z.string().optional(),
          inferSize: z.boolean().optional(),
          width: z.number().optional(),
          height: z.number().optional(),

          color: z.string().optional()
        })
        .optional(),
      tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
      language: z.string().optional(),
      draft: z.boolean().default(false),
      // Special fields
      comment: z.boolean().default(true)
    })
})

// Define songs collection
const songs = defineCollection({
  loader: glob({ base: './src/content/songs', pattern: '**/*.{md,mdx}' }),
  schema: () =>
    z
      .object({
        title: z.string().max(120).optional(),
        bvid: z
          .string()
          .regex(/^BV[0-9A-Za-z]+$/)
          .optional(),
        videoUrl: z.string().url().optional(),
        cover: z.string().min(1).optional(),
        collectDate: z.coerce.date(),
        tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
        note: z.string().max(280).optional(),
        draft: z.boolean().default(false)
      })
      .refine((val) => Boolean(val.videoUrl || val.bvid), {
        message: 'Either "videoUrl" or "bvid" is required.'
      })
})

export const collections = { blog, songs }
