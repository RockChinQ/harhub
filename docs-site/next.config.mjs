import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();
const basePath = process.env.HARHUB_DOCS_BASE_PATH ?? "";

/** @type {import("next").NextConfig} */
const config = {
  output: "export",
  basePath,
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true }
};

export default withMDX(config);
