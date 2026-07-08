import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const postsDir = path.join(root, "src/content/posts");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const errors = [];

function parseFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    errors.push(`${file}: missing frontmatter`);
    return null;
  }
  const yaml = match[1];
  const get = (key) => yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
  const slug = strip(get("slug"));
  const title = strip(get("title"));
  const description = strip(get("description"));
  const kind = strip(get("kind"));
  const publishedAt = strip(get("publishedAt"));
  const updatedAt = strip(get("updatedAt"));
  const draft = strip(get("draft"));
  return { yaml, text, slug, title, description, kind, publishedAt, updatedAt, draft };
}

function strip(value) {
  if (!value) return value;
  return value.replace(/^["']|["']$/g, "");
}

const files = fs.existsSync(postsDir)
  ? fs.readdirSync(postsDir).filter((name) => name.endsWith(".md") || name.endsWith(".mdx"))
  : [];

if (files.length === 0) {
  errors.push("No posts found in src/content/posts");
}

const slugs = new Set();
const publishedSlugs = new Set();
const relatedReferences = [];
const seriesPresence = [];

for (const name of files) {
  const file = path.join(postsDir, name);
  const data = parseFrontmatter(file);
  if (!data) continue;

  for (const key of ["title", "slug", "description", "kind", "publishedAt", "draft"]) {
    if (!data[key]) errors.push(`${name}: missing ${key}`);
  }
  if (!["tech", "note", "diary"].includes(data.kind)) errors.push(`${name}: invalid kind ${data.kind}`);
  if (!slugPattern.test(data.slug ?? "")) errors.push(`${name}: slug must be lowercase ASCII kebab-case`);
  if (/^\d+$/.test(data.slug ?? "")) errors.push(`${name}: slug must not be numeric-only`);
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(data.slug ?? "")) errors.push(`${name}: slug must not contain Korean`);
  if (slugs.has(data.slug)) errors.push(`${name}: duplicate slug ${data.slug}`);
  slugs.add(data.slug);
  if (data.draft !== "true") publishedSlugs.add(data.slug);
  if (data.updatedAt && new Date(data.updatedAt) < new Date(data.publishedAt)) {
    errors.push(`${name}: updatedAt is earlier than publishedAt`);
  }
  if (/needsReview|readingTime|reading time|difficulty/i.test(data.yaml)) {
    errors.push(`${name}: excluded metadata found`);
  }
  if (/devpro\.kr/i.test(data.text)) {
    errors.push(`${name}: legacy custom-domain string found`);
  }
  const relatedBlock = data.yaml.match(/^relatedPosts:\s*\[([^\]]*)\]/m);
  if (relatedBlock) {
    const refs = relatedBlock[1]
      .split(",")
      .map((item) => strip(item.trim()))
      .filter(Boolean);
    refs.forEach((slug) => relatedReferences.push({ file: name, slug }));
  }
  seriesPresence.push(/^series:/m.test(data.yaml));
}

for (const ref of relatedReferences) {
  if (!publishedSlugs.has(ref.slug)) {
    errors.push(`${ref.file}: relatedPosts references missing or draft post ${ref.slug}`);
  }
}

if (!seriesPresence.some(Boolean)) errors.push("No post has series metadata");
if (!seriesPresence.some((hasSeries) => !hasSeries)) errors.push("No standalone post exists to verify series omission");

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Content validation passed for ${files.length} posts.`);
