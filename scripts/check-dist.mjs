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
    "index.html",
    "rss.xml",
    "sitemap-index.xml",
    "search/index.html",
    "series/index.html",
    "tags/index.html",
    "tech/java/index.html",
    "notes/ide/index.html",
    "diary/troubleshooting/index.html",
    "diary/retrospective/index.html",
    "pagefind/pagefind.js",
    "pagefind/pagefind-entry.json"
  ];
  for (const output of requiredOutputs) {
    if (!fs.existsSync(path.join(distDir, output))) errors.push(`${output} was not generated`);
  }

  const homePath = path.join(distDir, "index.html");
  if (fs.existsSync(homePath)) {
    const home = fs.readFileSync(homePath, "utf8");
    const seriesHeadingIndex = home.indexOf('id="home-series-title"');
    const latestHeadingIndex = home.indexOf('id="home-latest-title"');
    const seriesSectionStart = home.lastIndexOf("<section", seriesHeadingIndex);
    const seriesSectionEnd = home.indexOf("</section>", seriesHeadingIndex);
    const seriesSection =
      seriesSectionStart !== -1 && seriesSectionEnd !== -1
        ? home.slice(seriesSectionStart, seriesSectionEnd + "</section>".length)
        : "";
    const homeSeriesCards = [...seriesSection.matchAll(
      /<li data-home-series-item><a class="home-series-card" href="([^"]+)">[\s\S]*?<strong>([^<]+)<\/strong>/g
    )].map((match) => ({ href: match[1], title: match[2] }));
    const expectedHomeSeriesCards = [
      { href: "/series/handoff-design/", title: "사람과 AI를 위한 핸드오프" },
      { href: "/series/ai-agent-server-testing/", title: "AI 에이전트와 서버 테스트 전략" }
    ];

    if (seriesHeadingIndex === -1 || latestHeadingIndex === -1 || seriesHeadingIndex > latestHeadingIndex) {
      errors.push("Home Series section was not generated before Latest posts");
    }
    if (JSON.stringify(homeSeriesCards) !== JSON.stringify(expectedHomeSeriesCards)) {
      errors.push(`Home curated series cards are invalid: ${JSON.stringify(homeSeriesCards)}`);
    }
    if (!/<a class="section-action" href="\/series\/">Series 전체 보기<\/a>/.test(seriesSection)) {
      errors.push("Home is missing the all-series link");
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Built output validation passed.");
