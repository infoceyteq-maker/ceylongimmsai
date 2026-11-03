import type { MetadataRoute } from "next";

/**
 * GIMMS — robots.txt.
 *
 * The hub is a private operations console. It must never be indexed: task titles,
 * client names and agent descriptions are internal business data, and search
 * engines were previously free to crawl every route (there was no robots.ts at all,
 * which lib/skills.ts `seo.structure` was already flagging as a failed check).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/"],
      },
    ],
  };
}
