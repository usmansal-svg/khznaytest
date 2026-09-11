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

export function shopifyConfig(): ShopifyConfig | null {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (!domain || !token) return null;
  return { domain: domain.replace(/^https?:\/\//, "").replace(/\/$/, ""), token, version: process.env.SHOPIFY_API_VERSION?.trim() || "2025-01" };
}

type GqlError = { message: string; field?: string[] | null };

export class ShopifyError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

export async function gql<T>(cfg: ShopifyConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${cfg.domain}/admin/api/${cfg.version}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": cfg.token },
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
  await setVariant(cfg, product.id, variant.id, input.sku, input.price);
  await setQuantity(cfg, variant.inventoryItem.id, 1, input.locationId ?? undefined);
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
  await setVariant(cfg, product.id, variant.id, input.sku, input.price);
  if (input.status === "ACTIVE") await setQuantity(cfg, variant.inventoryItem.id, 1, input.locationId ?? undefined);
  if (input.imageUrls.length) await addMedia(cfg, product.id, input.imageUrls, input.title);
  return { productId: product.id, handle: product.handle, variantId: variant.id, inventoryItemId: variant.inventoryItem.id, adminUrl: adminUrl(cfg, product.id) };
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
  if (inv) await setQuantity(cfg, inv, 0);
}

async function setVariant(cfg: ShopifyConfig, productId: string, variantId: string, sku: string, price: number) {
  const data = await gql<{ productVariantsBulkUpdate: { userErrors: GqlError[] } }>(
    cfg,
    `mutation variant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
       productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
     }`,
    { productId, variants: [{ id: variantId, price: price.toFixed(2), inventoryItem: { sku, tracked: true }, inventoryPolicy: "DENY" }] },
  );
  userErrors(data.productVariantsBulkUpdate.userErrors, "productVariantsBulkUpdate");
}

async function setQuantity(cfg: ShopifyConfig, inventoryItemId: string, quantity: number, location?: string) {
  const locationId = location ?? (await primaryLocationId(cfg));
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
