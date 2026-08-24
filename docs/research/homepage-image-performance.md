# How should the Homepage remain fast with many Work images?

## Conclusion

The Visitor Homepage should render at most 12 recent Work cards initially and include only each Work's Poster. It should use `next/image` with explicit dimensions, an accurate responsive `sizes` value, and a project loader that selects the existing sanitized Poster variants from the controlled media origin rather than invoking per-request image transformation. At most one verified Largest Contentful Paint candidate loads eagerly at high priority; every other Poster uses native lazy loading. Reserved aspect ratio, a small color placeholder, cursor-based continuation, CDN delivery, and field Core Web Vitals measurement complete the performance boundary.

## Findings

- Installed Next.js is `16.3.2`. Its Image component requires intrinsic dimensions or `fill` to reserve aspect ratio, uses `sizes` to let the browser choose an appropriate `srcset` candidate, defaults to native lazy loading, and recommends eager or high fetch priority only for an LCP image. Next.js 16 deprecates `priority` in favor of clearer loading controls. [Next.js Image documentation](https://nextjs.org/docs/app/api-reference/components/image)
- Missing `sizes` on a responsive image makes the browser assume `100vw`, which can download an unnecessarily large candidate. Responsive sources avoid sending desktop-sized images to smaller devices. [Next.js Image documentation](https://nextjs.org/docs/app/api-reference/components/image), [web.dev responsive images](https://web.dev/articles/serve-responsive-images)
- Lazy loading reduces unnecessary image transfer, but lazily loading the LCP image delays it. Only the likely LCP image should receive high priority; assigning high priority broadly removes the prioritization benefit. [web.dev LCP optimization](https://web.dev/articles/optimize-lcp), [web.dev lazy-loading analysis](https://web.dev/articles/lcp-lazy-loading)
- Self-hosted Next.js performs its default Image optimization at runtime and permits a custom loader or disabled optimization when images are already transformed elsewhere. This repository already creates bounded WebP variants asynchronously, so runtime re-encoding would duplicate work and add per-instance CPU/cache coordination. [Next.js self-hosting documentation](https://nextjs.org/docs/app/guides/self-hosting)
- Cloudflare caches R2 objects through a controlled custom domain, avoiding direct public `r2.dev` delivery and letting the project apply its cache and purge policy. [Cloudflare R2 public bucket documentation](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Cloudflare R2 cache documentation](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)
- Good field Core Web Vitals targets at the 75th percentile are LCP at most 2.5 seconds, CLS at most 0.1, and INP at most 200 milliseconds, measured separately for mobile and desktop. [web.dev LCP](https://web.dev/articles/lcp), [web.dev CLS](https://web.dev/articles/cls), [web.dev INP](https://web.dev/articles/optimize-inp)

## Showcase implications

- The Homepage returns no Gallery images and does not preload hidden carousel content. A first response contains at most 12 Work cards; further Works require cursor navigation or an explicit load-more action.
- Poster metadata must expose intrinsic dimensions, available variant widths, and a small dominant-color placeholder. The Visitor renders the fixed portrait ratio before bytes arrive, preventing image-driven layout shift.
- A Visitor image loader maps the browser-requested width to the smallest existing Poster variant that is not narrower than the request, falling back to the largest available variant without upscaling the source.
- The likely LCP Poster is discoverable in server-rendered HTML and may use `fetchPriority="high"` or eager loading after measurement. Every other Poster remains lazy; no page preloads multiple candidate Posters.
- A separate controlled media origin should be preconnected only when measurement shows the LCP connection setup is material. The CDN serves immutable variant objects while the Public Catalog invalidation contract controls current eligibility.
- Homepage performance is verified through image-selection tests, browser network assertions, Lighthouse or equivalent lab runs, and field Core Web Vitals. Lab scores supplement rather than replace p75 field data.

## Unknowns and verification plan

- The exact Homepage grid breakpoints and resulting `sizes` expression remain a UI implementation choice. Verify that each breakpoint selects the intended 480, 768, or 1,200 pixel Poster variant in a real browser.
- The actual LCP element may be text rather than a Poster on some viewports. Measure before applying high priority and ensure no more than one image is prioritized per rendered layout.
- Final encoded bytes depend on artwork complexity. Record variant byte distributions in media-processing telemetry and adjust encoding quality only with visual regression samples and field performance evidence.

## Sources

- [Next.js Image component](https://nextjs.org/docs/app/api-reference/components/image)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Serve responsive images](https://web.dev/articles/serve-responsive-images)
- [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp)
- [The performance effects of too much lazy loading](https://web.dev/articles/lcp-lazy-loading)
- [Largest Contentful Paint](https://web.dev/articles/lcp)
- [Cumulative Layout Shift](https://web.dev/articles/cls)
- [Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp)
- [Cloudflare R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare R2 cache integration](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)
