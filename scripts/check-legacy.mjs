import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const ignoredDirs = new Set([".git", "node_modules", ".astro"]);
const ignoredFiles = new Set(["docs/REBUILD_PLAN.md", "docs/UI_DIRECTIONS.md"]);
const legacyPathPatterns = [
  /^_posts(?:\/|$)/,
  /^_layouts(?:\/|$)/,
  /^_includes(?:\/|$)/,
  /^_sass(?:\/|$)/,
  /^_tabs(?:\/|$)/,
  /^_plugins(?:\/|$)/,
  /^_data(?:\/|$)/,
  /^_javascript(?:\/|$)/,
  /^_config\.yml$/,
  /^\.nojekyll$/,
  /^Gemfile$/,
  /^jekyll-theme-chirpy\.gemspec$/,
  /^CNAME$/
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (ignoredFiles.has(relative)) continue;
    if (legacyPathPatterns.some((pattern) => pattern.test(relative))) {
      errors.push(`Legacy artifact remains: ${relative}`);
    }
    const textExtensions = [".astro", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".xml", ".yml", ".yaml"];
    if (!textExtensions.includes(path.extname(entry.name))) continue;
    const text = fs.readFileSync(absolute, "utf8");
    if (/devpro\.kr/i.test(text)) errors.push(`Legacy custom-domain string remains: ${relative}`);
    if (/(^|["'(\s])\/posts\/[0-9]+(?:\/|["')\s#?])/.test(text)) {
      errors.push(`Numeric post URL remains: ${relative}`);
    }
  }
}

walk(root);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Legacy artifact validation passed.");
