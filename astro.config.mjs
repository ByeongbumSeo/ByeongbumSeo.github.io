import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";

function asciiHeadingIds() {
  return (tree) => {
    let index = 0;
    const idMap = new Map();

    const visit = (node) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "element" && /^h[1-6]$/.test(node.tagName)) {
        const properties = node.properties ?? {};
        const isFootnoteHeading = properties.id === "footnote-label";

        if (!isFootnoteHeading) {
          const previousId = typeof properties.id === "string" ? properties.id : undefined;
          index += 1;
          const nextId = `section-${index}`;
          if (previousId) idMap.set(previousId, nextId);
          node.properties = { ...properties, id: nextId };
        }
      }

      if (Array.isArray(node.children)) node.children.forEach(visit);
    };

    const rewriteHashLinks = (node) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "element" && node.tagName === "a") {
        const properties = node.properties ?? {};
        const href = typeof properties.href === "string" ? properties.href : "";
        if (href.startsWith("#")) {
          const rawId = href.slice(1);
          let decodedId = rawId;
          try {
            decodedId = decodeURIComponent(rawId);
          } catch {
            decodedId = rawId;
          }

          const nextId = idMap.get(decodedId) ?? idMap.get(rawId);
          if (nextId) node.properties = { ...properties, href: `#${nextId}` };
        }
      }

      if (Array.isArray(node.children)) node.children.forEach(rewriteHashLinks);
    };

    visit(tree);
    rewriteHashLinks(tree);
  };
}

export default defineConfig({
  site: "https://byeongbumseo.github.io",
  devToolbar: {
    enabled: false
  },
  integrations: [mdx(), sitemap()],
  markdown: {
    processor: unified({
      rehypePlugins: [rehypeHeadingIds, asciiHeadingIds]
    }),
    shikiConfig: {
      theme: "github-light"
    }
  }
});
