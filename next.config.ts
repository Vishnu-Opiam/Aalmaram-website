import type { NextConfig } from "next";

/**
 * store.aalmaram.com was Shopify's storefront and checkout host. Once its DNS
 * points at this project (and it is added as a domain in Vercel), old links
 * land on the same thing here: product pages keep their handle, collections
 * and the cart go to the shop and checkout, and anything else to the homepage.
 * Order-status links from old Shopify emails cannot be honoured — those go home.
 */
const SHOPIFY_HOST = [{ type: "host" as const, value: "store.aalmaram.com" }];
const APEX = "https://aalmaram.com";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/products/:handle", has: SHOPIFY_HOST, destination: `${APEX}/products/:handle`, permanent: true },
      { source: "/collections/:path*", has: SHOPIFY_HOST, destination: `${APEX}/shop`, permanent: true },
      { source: "/cart", has: SHOPIFY_HOST, destination: `${APEX}/checkout`, permanent: true },
      { source: "/:path*", has: SHOPIFY_HOST, destination: `${APEX}/`, permanent: true },
    ];
  },
};

export default nextConfig;
