/**
 * Storefront catalogue shapes.
 *
 * Deliberately separate from `commerce.ts`: that module is `server-only`, and
 * client components (the cart, the product card, the add-to-basket button) need
 * these types. A type-only import still puts the module in Turbopack's client
 * graph, so the types live where both sides can reach them.
 */

export interface StorefrontVariant {
  id: string;
  title: string;
  sku: string | null;
  /** Integer paise. */
  pricePaise: number;
  compareAtPaise: number | null;
  inventoryQuantity: number;
  weightGrams: number;
}

export interface StorefrontImage {
  url: string;
  alt: string;
}

export interface StorefrontProduct {
  id: string;
  handle: string;
  title: string;
  subtitle: string;
  descriptionMd: string;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  images: StorefrontImage[];
  variants: StorefrontVariant[];
}

export interface ShippingSettings {
  flatRatePaise: number;
  freeThresholdPaise: number;
}
