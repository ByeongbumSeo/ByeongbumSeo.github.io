import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const hangulPattern = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
const errors = [];

if (!fs.existsSync(distDir)) {
  errors.push("dist directory not found. Run npm run build before check:dist.");
}

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next, callback);
    else callback(next);
  }
}

function decodeHash(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function checkHtml(file, text) {
  const ids = new Set([...text.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));

  for (const match of text.matchAll(/\b(?:href|id)="([^"]+)"/g)) {
    if (hangulPattern.test(match[1])) {
      errors.push(`${path.relative(root, file)}: Korean href/id value ${match[0]}`);
    }
  }

  for (const match of text.matchAll(/\bhref="#([^"]+)"/g)) {
    const targetId = decodeHash(match[1]);
    if (!ids.has(targetId)) {
      errors.push(`${path.relative(root, file)}: missing hash target #${match[1]}`);
    }
  }
}

if (fs.existsSync(distDir)) {
  walk(distDir, (file) => {
    if (!file.endsWith(".html") && !file.endsWith(".xml")) return;
    const text = fs.readFileSync(file, "utf8");

    if (/devpro\.kr/i.test(text)) {
      errors.push(`${path.relative(root, file)}: legacy custom-domain string found`);
    }

    if (file.endsWith(".html")) checkHtml(file, text);
  });

  if (fs.existsSync(path.join(distDir, "posts/good-developer/index.html"))) {
    errors.push("Draft post good-developer was generated");
  }

  const requiredOutputs = [
    "rss.xml",
    "sitemap-index.xml",
    "search/index.html",
    "tags/index.html",
    "tech/java/index.html",
    "notes/ide/index.html",
    "diary/work-retrospective/index.html",
    "pagefind/pagefind.js",
    "pagefind/pagefind-entry.json"
  ];
  for (const output of requiredOutputs) {
    if (!fs.existsSync(path.join(distDir, output))) errors.push(`${output} was not generated`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Built output validation passed.");
