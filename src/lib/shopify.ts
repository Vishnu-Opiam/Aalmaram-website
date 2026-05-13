"use server";

let cachedStorefrontToken: string | null = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN || null;

async function getStorefrontToken(): Promise<string> {
  if (cachedStorefrontToken) return cachedStorefrontToken;

  const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    throw new Error(`Missing Shopify API credentials (domain: ${!!domain}, client ID: ${!!clientId}, secret: ${!!clientSecret}).`);
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const rawText = await res.text();
    let parsedText = rawText;
    try {
      parsedText = JSON.stringify(JSON.parse(rawText));
    } catch (e) {}
    throw new Error(`Failed to exchange client credentials for token: ${res.status} ${parsedText}`);
  }

  const json = await res.json();
  cachedStorefrontToken = json.access_token;
  return cachedStorefrontToken as string;
}

async function shopifyFetch<T>({ query, variables }: { query: string; variables?: Record<string, unknown> }): Promise<T> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const token = await getStorefrontToken();
  const endpoint = `https://${domain}/admin/api/2024-01/graphql.json`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) {
    console.error("\n\n=== SHOPIFY GRAPHQL ERROR ===");
    console.error(JSON.stringify(json.errors, null, 2));
    console.error("===============================\n\n");
    throw new Error("Shopify GraphQL Error: " + JSON.stringify(json.errors));
  }
  return json.data;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  handle: string;
  variants: {
    edges: {
      node: {
        id: string;
        title: string;
        price: string;
        compareAtPrice: string | null;
      };
    }[];
  };
  images: {
    edges: {
      node: { url: string; altText: string | null };
    }[];
  };
}

export async function getProduct(handle: string): Promise<ShopifyProduct | null> {
  const query = `
    query GetProduct($handle: String!) {
      product(handle: $handle) {
        id
        title
        description
        handle
        variants(first: 5) {
          edges {
            node {
              id
              title
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
            }
          }
        }
        images(first: 5) {
          edges {
            node { url altText }
          }
        }
      }
    }
  `;
  const data = await shopifyFetch<{ product: ShopifyProduct | null }>({ query, variables: { handle } });
  return data.product;
}

export async function getFirstProduct(): Promise<ShopifyProduct | null> {
  const query = `
    query GetFirstProduct {
      products(first: 1) {
        edges {
          node {
            id
            title
            description
            handle
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  price
                  compareAtPrice
                }
              }
            }
            images(first: 1) {
              edges {
                node { url altText }
              }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyFetch<{ products: { edges: { node: ShopifyProduct }[] } }>({ query });
  return data.products.edges[0]?.node || null;
}

export async function createCheckout(variantId: string, quantity: number) {
  const query = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
        }
        userErrors { field message }
      }
    }
  `;
  const data = await shopifyFetch<{ draftOrderCreate: { draftOrder: { id: string, invoiceUrl: string }, userErrors: any[] } }>({
    query,
    variables: { input: { lineItems: [{ variantId, quantity }] } }
  });
  
  if (data.draftOrderCreate.userErrors.length > 0) {
    throw new Error(data.draftOrderCreate.userErrors[0].message);
  }
  return data.draftOrderCreate.draftOrder.invoiceUrl;
}
