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

/* ────────────────────────────────────────────────────────────
   Events — backed by a Shopify Metaobject of type "event"
   ──────────────────────────────────────────────────────────── */

export interface EventRecord {
  id: string;
  title: string;
  date: string; // ISO date (YYYY-MM-DD)
  location: string;
  description: string;
  link: string;
}

export type EventInput = Omit<EventRecord, "id">;

const EVENT_TYPE = "event";

function fieldsToEvent(id: string, fields: { key: string; value: string | null }[]): EventRecord {
  const map = Object.fromEntries(fields.map((f) => [f.key, f.value ?? ""]));
  return {
    id,
    title: map.title ?? "",
    date: map.date ?? "",
    location: map.location ?? "",
    description: map.description ?? "",
    link: map.link ?? "",
  };
}

function eventToFields(input: EventInput) {
  return [
    { key: "title", value: input.title },
    { key: "date", value: input.date },
    { key: "location", value: input.location },
    { key: "description", value: input.description },
    { key: "link", value: input.link },
  ];
}

/** Creates the "event" metaobject definition if it doesn't already exist. Safe to call repeatedly. */
export async function ensureEventDefinition(): Promise<void> {
  const query = `
    mutation CreateDef($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id type }
        userErrors { field message code }
      }
    }
  `;
  const variables = {
    definition: {
      type: EVENT_TYPE,
      name: "Event",
      access: { storefront: "PUBLIC_READ" },
      fieldDefinitions: [
        { key: "title", name: "Title", type: "single_line_text_field" },
        { key: "date", name: "Date", type: "date" },
        { key: "location", name: "Location", type: "single_line_text_field" },
        { key: "description", name: "Description", type: "multi_line_text_field" },
        { key: "link", name: "Link", type: "url" },
      ],
    },
  };
  try {
    const data = await shopifyFetch<{
      metaobjectDefinitionCreate: { userErrors: { code: string; message: string }[] };
    }>({ query, variables });
    const errs = data.metaobjectDefinitionCreate.userErrors;
    // "TAKEN" means the definition already exists — that's fine.
    const fatal = errs.filter((e) => e.code !== "TAKEN");
    if (fatal.length > 0) {
      throw new Error("Failed to create event definition: " + JSON.stringify(fatal));
    }
  } catch (e) {
    // If the whole call errored because the definition exists, swallow it.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/TAKEN|already exists/i.test(msg)) throw e;
  }
}

export async function listEvents(): Promise<EventRecord[]> {
  const query = `
    query ListEvents {
      metaobjects(type: "${EVENT_TYPE}", first: 100, sortKey: "updated_at", reverse: true) {
        edges { node { id fields { key value } } }
      }
    }
  `;
  try {
    const data = await shopifyFetch<{
      metaobjects: { edges: { node: { id: string; fields: { key: string; value: string | null }[] } }[] };
    }>({ query });
    return data.metaobjects.edges.map((e) => fieldsToEvent(e.node.id, e.node.fields));
  } catch (e) {
    // No definition yet → no events. Don't crash the public page.
    const msg = e instanceof Error ? e.message : String(e);
    if (/metaobject|not.*found|undefined/i.test(msg)) return [];
    throw e;
  }
}

export async function createEvent(input: EventInput): Promise<EventRecord> {
  await ensureEventDefinition();
  const query = `
    mutation Create($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id fields { key value } }
        userErrors { field message code }
      }
    }
  `;
  const data = await shopifyFetch<{
    metaobjectCreate: {
      metaobject: { id: string; fields: { key: string; value: string | null }[] } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>({ query, variables: { metaobject: { type: EVENT_TYPE, fields: eventToFields(input) } } });

  if (data.metaobjectCreate.userErrors.length > 0) {
    throw new Error(data.metaobjectCreate.userErrors[0].message);
  }
  const node = data.metaobjectCreate.metaobject!;
  return fieldsToEvent(node.id, node.fields);
}

export async function updateEvent(id: string, input: EventInput): Promise<EventRecord> {
  const query = `
    mutation Update($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id fields { key value } }
        userErrors { field message code }
      }
    }
  `;
  const data = await shopifyFetch<{
    metaobjectUpdate: {
      metaobject: { id: string; fields: { key: string; value: string | null }[] } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>({ query, variables: { id, metaobject: { fields: eventToFields(input) } } });

  if (data.metaobjectUpdate.userErrors.length > 0) {
    throw new Error(data.metaobjectUpdate.userErrors[0].message);
  }
  const node = data.metaobjectUpdate.metaobject!;
  return fieldsToEvent(node.id, node.fields);
}

export async function deleteEvent(id: string): Promise<void> {
  const query = `
    mutation Delete($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
        userErrors { field message code }
      }
    }
  `;
  const data = await shopifyFetch<{
    metaobjectDelete: { deletedId: string | null; userErrors: { message: string }[] };
  }>({ query, variables: { id } });

  if (data.metaobjectDelete.userErrors.length > 0) {
    throw new Error(data.metaobjectDelete.userErrors[0].message);
  }
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
  const data = await shopifyFetch<{ draftOrderCreate: { draftOrder: { id: string, invoiceUrl: string }, userErrors: { field: string[]; message: string }[] } }>({
    query,
    variables: { input: { lineItems: [{ variantId, quantity }] } }
  });
  
  if (data.draftOrderCreate.userErrors.length > 0) {
    throw new Error(data.draftOrderCreate.userErrors[0].message);
  }
  return data.draftOrderCreate.draftOrder.invoiceUrl;
}
