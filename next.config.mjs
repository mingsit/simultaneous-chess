/**
 * @type {import('next').NextConfig}
 *
 * `PAGES_BASE_PATH` is only set by the GitHub Pages workflow: a project site
 * lives under /<repo>, so every asset URL needs that prefix. Local builds and
 * `npm start` leave it unset and serve everything from the root.
 */
const basePath = process.env.PAGES_BASE_PATH || undefined;

const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  trailingSlash: true,
  basePath,
};

export default nextConfig;
