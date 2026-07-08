import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

export async function getPublishedPosts() {
  const posts = await getCollection("posts");
  return sortPosts(posts.filter((post) => !post.data.draft));
}

export async function getAllPosts() {
  const posts = await getCollection("posts");
  return sortPosts(posts);
}

export function sortPosts(posts: Post[]) {
  return [...posts].sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

export function postUrl(post: Post) {
  return `/posts/${post.data.slug}/`;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

export function getKindPosts(posts: Post[], kind: Post["data"]["kind"]) {
  return posts.filter((post) => post.data.kind === kind);
}

export function getRelatedPosts(post: Post, posts: Post[], limit = 3) {
  const explicit = post.data.relatedPosts
    .map((slug) => posts.find((candidate) => candidate.data.slug === slug))
    .filter(Boolean) as Post[];
  const explicitSlugs = new Set(explicit.map((candidate) => candidate.data.slug));
  const fallback = posts
    .filter((candidate) => candidate.data.slug !== post.data.slug)
    .filter((candidate) => !explicitSlugs.has(candidate.data.slug))
    .map((candidate) => ({
      post: candidate,
      score: candidate.data.tags.filter((tag) => post.data.tags.includes(tag)).length
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.post);

  return [...explicit, ...fallback].slice(0, limit);
}

export function getSeriesPosts(post: Post, posts: Post[]) {
  if (!post.data.series) return [];
  return posts
    .filter((candidate) => candidate.data.series?.slug === post.data.series?.slug)
    .sort((a, b) => (a.data.series?.order ?? 0) - (b.data.series?.order ?? 0));
}

export function getAllTags(posts: Post[]) {
  return [...new Set(posts.flatMap((post) => post.data.tags))].sort((a, b) => a.localeCompare(b));
}

export function getSeriesGroups(posts: Post[]) {
  const groups = new Map<string, { title: string; posts: Post[] }>();
  for (const post of posts) {
    if (!post.data.series) continue;
    const current = groups.get(post.data.series.slug) ?? { title: post.data.series.title, posts: [] };
    current.posts.push(post);
    groups.set(post.data.series.slug, current);
  }
  for (const group of groups.values()) {
    group.posts.sort((a, b) => (a.data.series?.order ?? 0) - (b.data.series?.order ?? 0));
  }
  return groups;
}
