# Khazanay website catalogue (12 Sep 2026)

**Purpose.** The tagging catalogue (gender → category → sub-category) is also the
website's navigation. Every garment carries tags built from it, Shopify's
automated collections pick garments up by those tags, and the menu links to
the collections. Change the catalogue here, and the website follows.

Status: **applied to the database on 12 Sep 2026** by
`scripts/seed-catalogue-2026-09.mjs` (Usman approved the tree). Everything
below is live on the Catalogue screen; *(have)* marks what already existed
(renamed to these names), *(retire)* marks the broad ones now switched off.
Numbers for the new sub-categories were copied from the dearest sibling in
the same category and should be tuned in Pricing → Categories.

## How the tags will work

For a men's formal shirt tagged for summer the garment carries:

| Tag | Used for |
|---|---|
| `Men` | the top-level Men page |
| `Men Shirts` | the category page in the Men menu (**new tag**) |
| `Men Formal Shirt` | the sub-category page |
| `Summer`, `Summer Men`, `Summer Men Formal Shirt` | seasonal collections — the season is picked on the tag form, so no seasonal sub-categories are needed |
| `Kids`, `Teens`, `Toddlers`, `Infants` | band collections for children's wear |
| `POS only` / `Website` / `Draft` | channel (already in place) |

Menu: **Men → Shirts → Formal Shirts** is three collections with the rules
*tag equals `Men`*, *tag equals `Men Shirts`*, *tag equals `Men Formal Shirt`*.
Once approved, the app can create every collection and the menu itself
through Shopify's API, and keep them in step when a sub-category is added.

Children's wear: four catalogues, one per age band (Infants, Toddlers, Kids,
Teens), each with its own menu tags; the wearer picked on the tag form adds
`Kids Boys` / `Infant Girls` and the umbrella `Kids`. See the Children section.

---

## MEN

**T-Shirts** — Basic T-shirt *(have, as "Men T-shirt")*, Graphic T-shirt, Long sleeve T-shirt, Henley, V-neck T-shirt, Oversized T-shirt

**Polo Shirts** — Polo shirt *(have)*, Long sleeve polo

**Shirts** — Formal shirt, Casual shirt, Denim shirt, Flannel shirt, Linen shirt, Printed shirt, Overshirt · *(retire: Men Button-down shirt)*

**Sweaters & Hoodies** — Hoodie, Zip-up hoodie, Sweatshirt, Crewneck sweater, Cardigan, Half-zip pullover, Turtleneck, Knit vest · *(retire: Heavy/Light hoodie, Heavy/Light zip-up → the weight goes on the season, not the name)*

**Jackets & Coats** — Puffer jacket, Bomber jacket, Denim jacket, Leather jacket, Overcoat, Trench coat, Parka, Windbreaker, Fleece jacket, Gilet / Vest, Blazer, Raincoat · *(retire the Heavy/Light pairs the same way)*

**Jeans** — Slim jeans, Straight jeans, Regular jeans, Relaxed / baggy jeans, Ripped jeans, Denim shorts · *(retire: Men Jeans)*

**Pants & Trousers** — Chinos *(have, as "Cotton pants / chinos")*, Dress pant *(have)*, Casual trouser, Cargo pant, Corduroy pant, Linen trouser, Nightwear pajama

**Shorts** — Chino shorts, Cargo shorts, Casual shorts · *(retire: Men Shorts)*

**Activewear Sports Top** — Sports T-shirt *(have)*, Sports polo *(have)*, Sports tank top, Sports stringer, Sports jersey, Sports shirt, Sports zip-up *(have)*, Half-zip sports pullover, Sports hoodie *(have)*, Long sleeve sports top *(have, as "Long sleeve T-shirt")*, Cycling top, Baseball shirt, Basketball jersey

**Activewear Sports Bottom** — Sports shorts *(have)*, Sports sweatpants *(have)*, Track pant / sports trouser, Swimming shorts, Cycling shorts, Golf pant, American football pant

**Compression Wear** — Compression top, Compression tights, Compression shorts

**Suits & Formal** *(new category)* — Suit jacket, Suit trouser, Waistcoat, Tuxedo jacket

**Nightwear & Loungewear** *(new category)* — Pajama set, Lounge pant, Robe

---

## WOMEN

**Tops & Blouses** — Blouse *(have)*, Casual top *(have, as "Women Top")*, Formal top, Party top, Crop top, Off-shoulder top, Casual tank top, Camisole, Tunic, Summer knit, Peplum top

**T-Shirts** — Basic T-shirt *(have)*, Graphic T-shirt, Long sleeve T-shirt, Oversized T-shirt

**Polo Shirts** — Polo shirt *(have)*

**Shirts** — Formal shirt, Casual shirt, Denim shirt, Flannel shirt, Linen shirt, Oversized shirt · *(retire: Women Button-down shirt)*

**Dresses & Jumpsuits** — Short dress, Midi dress, Long / maxi dress, Party dress, Shirt dress, Knit dress, Cover-up dress, Bodysuit, Jumpsuit, Playsuit / romper · *(retire: Women Dress)*

**Skirts** — Mini skirt, Midi skirt, Maxi skirt, Denim skirt, Pleated skirt · *(retire: Women Skirt)*

**Jeans** — Skinny jeans, Straight jeans, Mom jeans, Wide-leg jeans, Bootcut / flared jeans, Ripped jeans, Denim shorts · *(retire: Women Jeans)*

**Pants & Trousers** — Casual trouser *(have, as "Casual pants")*, Dress pant, Cargo pant, Legging, Palazzo *(have)*, Wide-leg trouser, Culottes, Corduroy pant, Sweatpants *(have)*

**Shorts** — Denim shorts, Casual shorts, Skort · *(retire: Women Shorts)*

**Sweaters & Hoodies** — Hoodie, Zip-up hoodie, Sweatshirt, Crewneck sweater, Cardigan, Turtleneck, Knit vest, Poncho · *(retire the Heavy/Light pairs)*

**Jackets & Coats** — Puffer jacket, Bomber jacket, Denim jacket, Leather jacket, Overcoat, Trench coat, Parka, Windbreaker, Fleece jacket, Gilet / Vest, Blazer, Raincoat, Cape · *(retire the Heavy/Light pairs)*

**Activewear Sports Top** — Sports T-shirt *(have)*, Sports tank top, Sports bra *(have)*, Sports zip-up *(have)*, Sports hoodie *(have)*, Sports jersey, Long sleeve sports top *(have)*, Sports polo *(have)*

**Activewear Sports Bottom** — Sports leggings, Sports shorts *(have)*, Sweatpants, Track pant, Cycling shorts, Yoga pant, Skort

**Compression Wear** — Compression top, Compression tights

**Nightwear** — Pajama set *(have, as "Reon Pajama")*, Nightdress, Robe, Loungewear set

**Waistcoats** — Waistcoat, Suit jacket, Suit trouser *(rename category to "Suits & Formal")*

**Co-ords & Sets** *(new category)* — Two-piece set, Tracksuit

---

## CHILDREN — four age bands, each its own menu (13 Sep 2026)

Each band is its own catalogue and its own menu gender, so the tags never mix ages: **Infants** (0–12 months, tag `Infants`), **Toddlers** (12–24 months, `Toddlers`), **Kids** (2–8 years, `Kids`), **Teens** (9–14 years, `Teens`). The wearer picked on the tag form (Infant girl, Kids boy…) chooses the band's catalogue and adds the boy/girl tag (`Infant Girls`, `Kids Boys`). Every child garment also carries the umbrella tag `Kids` so one collection can gather all children's wear. "Baby" is not a category: it is the Infants band.

**Infants** — Bodysuits & Onesies (Short sleeve bodysuit, Long sleeve bodysuit, Sleeveless bodysuit) · Rompers & Sleepsuits (Romper, Sleepsuit, Dungarees) · Sets (Baby set, Top & bottom set, Gift set) · Tops (T-shirt, Shirt, Vest) · Bottoms (Leggings, Trousers, Shorts, Joggers) · Dresses (Baby dress, Party dress) · Sweaters & Cardigans (Cardigan, Sweater, Hoodie) · Jackets & Coats (Puffer jacket, Snowsuit / pramsuit, Fleece, Jacket) · Nightwear (Pajama set, Sleeping bag, Nightgown)

**Toddlers** — Tops (T-shirt, Long sleeve T-shirt, Polo shirt, Shirt, Blouse, Tank top) · Bottoms (Jeans, Trousers, Leggings, Shorts, Joggers, Dungarees) · Dresses & Skirts (Dress, Party dress, Skirt, Romper / playsuit) · Sets (Two-piece set, Tracksuit) · Sweaters & Hoodies (Hoodie, Sweatshirt, Sweater, Cardigan) · Jackets & Coats (Puffer jacket, Jacket, Coat, Raincoat, Fleece, Snowsuit) · Nightwear (Pajama set, Sleepsuit)

**Kids** — Tops (T-shirt, Polo shirt, Shirt, Blouse, Tank top, Long sleeve T-shirt) · Bottoms (Jeans, Trousers, Shorts, Leggings, Joggers / sweatpants, Cargo pant) · Dresses & Skirts (Dress, Skirt, Jumpsuit / romper, Party dress) · Sweaters & Hoodies (Hoodie, Sweatshirt, Sweater, Cardigan, Zip-up hoodie) · Jackets & Coats (Puffer jacket, Jacket, Coat, Raincoat, Fleece) · Activewear (Sports T-shirt, Sports shorts, Tracksuit, Sports leggings) · Nightwear (Pajama set, Sleepsuit)

**Teens** — T-Shirts (Basic, Graphic, Long sleeve, Oversized) · Polo Shirts (Polo shirt) · Shirts (Casual, Formal, Denim, Flannel) · Tops & Blouses (Blouse, Crop top, Tank top, Casual top) · Jeans (Slim, Straight, Relaxed, Ripped) · Pants & Trousers (Chinos, Cargo pant, Joggers, Leggings, Casual trouser) · Shorts (Denim, Cargo, Casual) · Dresses & Skirts (Dress, Party dress, Skirt, Jumpsuit) · Sweaters & Hoodies (Hoodie, Zip-up hoodie, Sweatshirt, Sweater, Cardigan) · Jackets & Coats (Puffer, Bomber, Denim jacket, Coat, Windbreaker, Fleece, Raincoat) · Activewear (Sports T-shirt, Sports shorts, Sports leggings, Tracksuit, Sports hoodie) · Nightwear (Pajama set)

Seeded by `scripts/seed-age-bands-2026-09.mjs`; costs copied from the Kids sub-category with the closest name.

---

## What each new sub-category needs

A three-letter code for the SKU, a weight, a selling profile, a value index
and a **cost per piece** — all copied from the nearest existing one in the
same category at creation, then adjusted in Pricing → Categories (or via the
Excel export). Retired ones are switched off, not deleted, so old garments
keep their names.

Totals if approved as written: Men 12 categories / ~85 sub-categories,
Women 16 / ~95, Kids 8 / ~35.
