import assert from "node:assert/strict";
import test from "node:test";

import { injectSeoMetadata, seoMetadataForPath } from "../src/server/seo.js";

const template = '<!doctype html><html lang="en"><head><!--seo-head--></head><body><div id="root"><!--seo-body--></div></body></html>';

test("renders unique indexable SEO for the website and Blog", () => {
  const home = injectSeoMetadata(template, seoMetadataForPath("/"));
  assert.match(home, /<title>Harhub — Agent Skills and MCP asset control/);
  assert.match(home, /rel="canonical" href="https:\/\/harhub\.rcpd\.cc\/"/);
  assert.match(home, /"@type":"SoftwareApplication"/);
  assert.match(home, /Keep every repo in sync/);

  const blog = injectSeoMetadata(template, seoMetadataForPath("/blog"));
  assert.match(blog, /<title>Harhub Blog/);
  assert.match(blog, /rel="canonical" href="https:\/\/harhub\.rcpd\.cc\/blog"/);
  assert.match(blog, /"@type":"Blog"/);
  assert.match(blog, /harhub-introduction/);
});

test("renders article metadata, Chinese language, JSON-LD, and crawlable text", () => {
  const metadata = seoMetadataForPath("/blog/harhub-introduction");
  const html = injectSeoMetadata(template, metadata);
  assert.equal(metadata.statusCode, undefined);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<meta property="og:type" content="article"/);
  assert.match(html, /article:published_time/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /<h1>Harhub：面向团队的 Agent Skills 与 MCP 资产治理平台<\/h1>/);
  assert.match(html, /检测仓库中的资产变更/);
});

test("marks application and unknown routes noindex while returning real 404s", () => {
  const app = seoMetadataForPath("/projects");
  assert.equal(app.statusCode, 200);
  assert.equal(app.robots, "noindex, nofollow");

  const missing = seoMetadataForPath("/does-not-exist");
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.robots, "noindex, nofollow");

  const missingArticle = seoMetadataForPath("/blog/missing");
  assert.equal(missingArticle.statusCode, 404);
  assert.equal(missingArticle.robots, "noindex, nofollow");
});
