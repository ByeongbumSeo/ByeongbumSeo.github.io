import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase ASCII kebab-case")
  .refine((slug) => !/^\d+$/.test(slug), "Slug must not be numeric-only");

const statusSchema = z.union([
  z.literal(false),
  z.object({
    since: z.coerce.date(),
    reason: z.string().min(1),
    replacementSlug: slugSchema.optional()
  })
]);

const referenceSchema = z.object({
  title: z.string().min(1),
  url: z.url()
});

const posts = defineCollection({
  loader: glob({ base: "./src/content/posts", pattern: "**/*.{md,mdx}" }),
  schema: z
    .object({
      title: z.string().min(1),
      slug: slugSchema,
      description: z.string().min(1),
      kind: z.enum(["tech", "note", "diary"]),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      deprecated: statusSchema.default(false),
      outdated: statusSchema.default(false),
      tags: z.array(slugSchema).default([]),
      series: z
        .object({
          slug: slugSchema,
          title: z.string().min(1),
          order: z.number().int().positive()
        })
        .optional(),
      relatedPosts: z.array(slugSchema).default([]),
      references: z.array(referenceSchema).default([])
    })
    .superRefine((data, context) => {
      if (data.updatedAt && data.updatedAt < data.publishedAt) {
        context.addIssue({
          code: "custom",
          path: ["updatedAt"],
          message: "updatedAt must not be earlier than publishedAt"
        });
      }
    })
});

export const collections = { posts };
