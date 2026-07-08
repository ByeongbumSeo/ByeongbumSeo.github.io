import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const postsDir = path.join(root, "src/content/posts");
const publicDir = path.join(root, "public");
const errors = [];
const slugs = new Set();

function readFrontmatter(text) {
  return text.match(/^---\n([\s\S]*?)\n---\n?/)?.[1] ?? "";
}

for (const name of fs.readdirSync(postsDir).filter((name) => name.endsWith(".md") || name.endsWith(".mdx"))) {
  const text = fs.readFileSync(path.join(postsDir, name), "utf8");
  const slug = readFrontmatter(text).match(/^slug:\s*["']?([^"'\n]+)["']?/m)?.[1];
  if (slug) slugs.add(slug);
}

function checkSource(file) {
  const text = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  const markdownLinks = [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  const htmlPaths = [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
  for (const rawTarget of [...markdownLinks, ...htmlPaths]) {
    const target = rawTarget.split("#")[0].trim();
    if (!target || target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:")) continue;
    if (target.startsWith("/assets/")) {
      const assetPath = path.join(publicDir, decodeURIComponent(target));
      if (!fs.existsSync(assetPath)) errors.push(`${relative}: missing asset ${target}`);
      continue;
    }
    if (target.startsWith("/posts/")) {
      const slug = target.replace(/^\/posts\//, "").replace(/\/$/, "");
      if (!slugs.has(slug)) errors.push(`${relative}: missing post link ${target}`);
      continue;
    }
  }
}

for (const name of fs.readdirSync(postsDir).filter((name) => name.endsWith(".md") || name.endsWith(".mdx"))) {
  checkSource(path.join(postsDir, name));
}

if (fs.existsSync(path.join(root, "dist"))) {
  const htmlFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith(".html")) htmlFiles.push(next);
    }
  };
  walk(path.join(root, "dist"));
  for (const file of htmlFiles) checkSource(file);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Internal link and image validation passed.");
