/**
 * Shopify Admin GraphQL client — server-only.
 *
 * Configuration comes from environment variables set in Vercel (never in
 * code or NEXT_PUBLIC_*):
 *   SHOPIFY_STORE_DOMAIN        e.g. khazanay.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN  custom app token with write_products,
 *                               write_inventory, read_locations
 *   SHOPIFY_API_VERSION         optional, default 2025-01
 *
 * One garment = one product with a single variant of quantity 1. Selling it
 * in an outlet unlists it (status DRAFT, quantity 0) rather than deleting,
 * so the record and its photos survive.
 */

export type ShopifyConfig = { domain: string; token: string; version: string };

const cleanDomain = (d: string) => d.replace(/^https?:\/\//, "").replace(/\/$/, "");
const apiVersion = () => process.env.SHOPIFY_API_VERSION?.trim() || "2025-01";

/**
 * Two ways to authenticate, in order of preference:
 *  1. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET — the Dev Dashboard app's
 *     credentials. Exchanged for an access token (client credentials grant),
 *     which lasts 24 hours and is refreshed here before it expires.
 *  2. SHOPIFY_ADMIN_ACCESS_TOKEN — a fixed token from a legacy custom app.
 * SHOPIFY_STORE_DOMAIN is the store's .myshopify.com address either way.
 */
export function shopifyConfig(): ShopifyConfig | null {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (!domain) return null;
  if (token) return { domain: cleanDomain(domain), token, version: apiVersion() };
  if (process.env.SHOPIFY_CLIENT_ID?.trim() && process.env.SHOPIFY_CLIENT_SECRET?.trim()) return { domain: cleanDomain(domain), token: "", version: apiVersion() };
  return null;
}

/** Is Shopify configured at all (either way)? */
export const shopifyConfigured = () => shopifyConfig() != null;

let cached: { token: string; expiresAt: number } | null = null;

/** The access token to use right now: the fixed one, or a fresh client-credentials token (cached until shortly before expiry). */
async function accessToken(cfg: ShopifyConfig): Promise<string> {
  if (cfg.token) return cfg.token;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://${cfg.domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID!.trim(), client_secret: process.env.SHOPIFY_CLIENT_SECRET!.trim(), grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new ShopifyError(`Shopify would not issue a token (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}. Check SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET and that the app is installed on the store.`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 86400) * 1000 };
  return cached.token;
}

type GqlError = { message: string; field?: string[] | null };

export class ShopifyError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

export async function gql<T>(cfg: ShopifyConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await accessToken(cfg);
  const res = await fetch(`https://${cfg.domain}/admin/api/${cfg.version}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new ShopifyError(`Shopify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: T; errors?: GqlError[] };
  if (json.errors?.length) throw new ShopifyError(json.errors.map((e) => e.message).join("; "), json.errors);
  if (!json.data) throw new ShopifyError("Shopify returned no data.");
  return json.data;
}

function userErrors(errs: GqlError[] | undefined, what: string) {
  if (errs?.length) throw new ShopifyError(`${what}: ${errs.map((e) => `${e.field?.join(".") ?? ""} ${e.message}`.trim()).join("; ")}`, errs);
}

export type Visibility = "draft" | "pos" | "online" | "both";

export type ProductInput = {
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  sku: string;
  price: number;
  imageUrls: string[];
  status: "ACTIVE" | "DRAFT";
  /** Where the single unit of stock sits; the outlet's Shopify location for outlet stock, else the first active location. */
  locationId?: string | null;
  /** Untracked: no stock count at any location, so any outlet's POS can sell it; the sale then takes it off Shopify. */
  untracked?: boolean;
};

export type PushResult = { productId: string; handle: string; variantId: string; inventoryItemId: string; adminUrl: string };

/** The first active location — Khazanay's online stock lives in one place. */
export async function primaryLocationId(cfg: ShopifyConfig): Promise<string> {
  const data = await gql<{ locations: { nodes: { id: string; name: string }[] } }>(cfg, `query { locations(first: 1, query: "active:true") { nodes { id name } } }`, {});
  const loc = data.locations.nodes[0];
  if (!loc) throw new ShopifyError("Shopify has no active location to hold inventory.");
  return loc.id;
}

export async function createProduct(cfg: ShopifyConfig, input: ProductInput): Promise<PushResult> {
  const data = await gql<{
    productCreate: { product: { id: string; handle: string; variants: { nodes: { id: string; inventoryItem: { id: string } }[] } } | null; userErrors: GqlError[] };
  }>(
    cfg,
    `mutation create($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
       productCreate(product: $product, media: $media) {
         product { id handle variants(first: 1) { nodes { id inventoryItem { id } } } }
         userErrors { field message }
       }
     }`,
    {
      product: { title: input.title, descriptionHtml: input.descriptionHtml, vendor: input.vendor, productType: input.productType, tags: input.tags, status: input.status },
      media: input.imageUrls.map((url, i) => ({ originalSource: url, mediaContentType: "IMAGE", alt: i === 0 ? input.title : `${input.title} ${i + 1}` })),
    },
  );
  userErrors(data.productCreate.userErrors, "productCreate");
  const product = data.productCreate.product!;
  const variant = product.variants.nodes[0];
  await setVariant(cfg, product.id, variant.id, input.sku, input.price, !input.untracked);
  if (!input.untracked) await setQuantity(cfg, variant.inventoryItem.id, 1, input.locationId ?? undefined);
  return { productId: product.id, handle: product.handle, variantId: variant.id, inventoryItemId: variant.inventoryItem.id, adminUrl: adminUrl(cfg, product.id) };
}

export async function updateProduct(cfg: ShopifyConfig, productId: string, input: ProductInput): Promise<PushResult> {
  const data = await gql<{
    productUpdate: { product: { id: string; handle: string; variants: { nodes: { id: string; inventoryItem: { id: string } }[] } } | null; userErrors: GqlError[] };
  }>(
    cfg,
    `mutation update($product: ProductUpdateInput!) {
       productUpdate(product: $product) {
         product { id handle variants(first: 1) { nodes { id inventoryItem { id } } } }
         userErrors { field message }
       }
     }`,
    { product: { id: productId, title: input.title, descriptionHtml: input.descriptionHtml, vendor: input.vendor, productType: input.productType, tags: input.tags, status: input.status } },
  );
  userErrors(data.productUpdate.userErrors, "productUpdate");
  const product = data.productUpdate.product!;
  const variant = product.variants.nodes[0];
  await setVariant(cfg, product.id, variant.id, input.sku, input.price, !input.untracked);
  if (input.status === "ACTIVE" && !input.untracked) await setQuantity(cfg, variant.inventoryItem.id, 1, input.locationId ?? undefined);
  if (input.imageUrls.length) await addMedia(cfg, product.id, input.imageUrls, input.title);
  return { productId: product.id, handle: product.handle, variantId: variant.id, inventoryItemId: variant.inventoryItem.id, adminUrl: adminUrl(cfg, product.id) };
}

/** A product already on the store carrying this SKU on its variant — so a retry never creates a duplicate. */
export async function findProductBySku(cfg: ShopifyConfig, sku: string): Promise<{ productId: string; handle: string; variantId: string; inventoryItemId: string } | null> {
  const data = await gql<{ productVariants: { nodes: { id: string; inventoryItem: { id: string }; product: { id: string; handle: string } }[] } }>(
    cfg,
    `query bySku($q: String!) { productVariants(first: 1, query: $q) { nodes { id inventoryItem { id } product { id handle } } } }`,
    { q: `sku:${JSON.stringify(sku)}` },
  );
  const v = data.productVariants.nodes[0];
  return v ? { productId: v.product.id, handle: v.product.handle, variantId: v.id, inventoryItemId: v.inventoryItem.id } : null;
}

/** Every location on the store, for mapping outlets to where their Shopify POS pulls stock from. */
export async function listLocations(cfg: ShopifyConfig): Promise<{ id: string; name: string; active: boolean }[]> {
  const data = await gql<{ locations: { nodes: { id: string; name: string; isActive: boolean }[] } }>(cfg, `query { locations(first: 50) { nodes { id name isActive } } }`, {});
  return data.locations.nodes.map((l) => ({ id: l.id, name: l.name, active: l.isActive }));
}

/** The store's sales channels ("publications"): Online Store and Point of Sale are the two we care about. */
async function publicationIds(cfg: ShopifyConfig): Promise<{ online: string | null; pos: string | null }> {
  const data = await gql<{ publications: { nodes: { id: string; name: string }[] } }>(cfg, `query { publications(first: 20) { nodes { id name } } }`, {});
  const find = (re: RegExp) => data.publications.nodes.find((p) => re.test(p.name))?.id ?? null;
  return { online: find(/online store/i), pos: find(/point of sale|^pos$/i) };
}

/**
 * Which channels a product is on. Shopify POS can only sell an ACTIVE product
 * published to the Point of Sale channel, so "POS only" means active + POS,
 * not on the Online Store; "draft" means hidden everywhere.
 */
export async function setVisibility(cfg: ShopifyConfig, productId: string, visibility: Visibility): Promise<void> {
  const pubs = await publicationIds(cfg);
  const wantOnline = visibility === "online" || visibility === "both";
  const wantPos = visibility === "pos" || visibility === "both";
  if (wantPos && !pubs.pos) throw new ShopifyError("This Shopify store has no Point of Sale channel — install the POS sales channel first.");
  const publish: string[] = [], unpublish: string[] = [];
  if (pubs.online) (wantOnline ? publish : unpublish).push(pubs.online);
  if (pubs.pos) (wantPos ? publish : unpublish).push(pubs.pos);
  if (publish.length) {
    const d = await gql<{ publishablePublish: { userErrors: GqlError[] } }>(cfg, `mutation pub($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`, { id: productId, input: publish.map((publicationId) => ({ publicationId })) });
    userErrors(d.publishablePublish.userErrors, "publishablePublish");
  }
  if (unpublish.length) {
    const d = await gql<{ publishableUnpublish: { userErrors: GqlError[] } }>(cfg, `mutation unpub($id: ID!, $input: [PublicationInput!]!) { publishableUnpublish(id: $id, input: $input) { userErrors { field message } } }`, { id: productId, input: unpublish.map((publicationId) => ({ publicationId })) });
    userErrors(d.publishableUnpublish.userErrors, "publishableUnpublish");
  }
}

/** Sold in store or pulled: hide online and zero the stock, keep the record. */
export async function unlistProduct(cfg: ShopifyConfig, productId: string): Promise<void> {
  const data = await gql<{ productUpdate: { product: { variants: { nodes: { inventoryItem: { id: string } }[] } } | null; userErrors: GqlError[] } }>(
    cfg,
    `mutation unlist($product: ProductUpdateInput!) {
       productUpdate(product: $product) { product { variants(first: 1) { nodes { inventoryItem { id } } } } userErrors { field message } }
     }`,
    { product: { id: productId, status: "DRAFT" } },
  );
  userErrors(data.productUpdate.userErrors, "productUpdate");
  const inv = data.productUpdate.product?.variants.nodes[0]?.inventoryItem.id;
  if (inv) { try { await setQuantity(cfg, inv, 0); } catch { /* untracked stock has no quantity to zero; DRAFT already hides it */ } }
}

async function setVariant(cfg: ShopifyConfig, productId: string, variantId: string, sku: string, price: number, tracked = true) {
  const data = await gql<{ productVariantsBulkUpdate: { userErrors: GqlError[] } }>(
    cfg,
    `mutation variant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
       productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
     }`,
    { productId, variants: [{ id: variantId, price: price.toFixed(2), inventoryItem: { sku, tracked }, inventoryPolicy: tracked ? "DENY" : "CONTINUE" }] },
  );
  userErrors(data.productVariantsBulkUpdate.userErrors, "productVariantsBulkUpdate");
}

async function setQuantity(cfg: ShopifyConfig, inventoryItemId: string, quantity: number, location?: string) {
  const locationId = location ?? (await primaryLocationId(cfg));
  // An inventory item must be stocked ("activated") at a location before a quantity can be set there.
  const act = await gql<{ inventoryActivate: { userErrors: GqlError[] } }>(
    cfg,
    `mutation act($inventoryItemId: ID!, $locationId: ID!, $available: Int) { inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) { userErrors { field message } } }`,
    { inventoryItemId, locationId, available: quantity },
  );
  // "already active" is not an error for us; anything else is.
  const real = (act.inventoryActivate.userErrors ?? []).filter((e) => !/already/i.test(e.message));
  userErrors(real, "inventoryActivate");
  const data = await gql<{ inventorySetQuantities: { userErrors: GqlError[] } }>(
    cfg,
    `mutation qty($input: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $input) { userErrors { field message } } }`,
    { input: { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities: [{ inventoryItemId, locationId, quantity }] } },
  );
  userErrors(data.inventorySetQuantities.userErrors, "inventorySetQuantities");
}

async function addMedia(cfg: ShopifyConfig, productId: string, urls: string[], alt: string) {
  const data = await gql<{ productCreateMedia: { mediaUserErrors: GqlError[] } }>(
    cfg,
    `mutation media($productId: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $productId, media: $media) { mediaUserErrors { field message } } }`,
    { productId, media: urls.map((url, i) => ({ originalSource: url, mediaContentType: "IMAGE", alt: i === 0 ? alt : `${alt} ${i + 1}` })) },
  );
  userErrors(data.productCreateMedia.mediaUserErrors, "productCreateMedia");
}

function adminUrl(cfg: ShopifyConfig, productGid: string) {
  return `https://${cfg.domain}/admin/products/${productGid.split("/").pop()}`;
}
