# Khazanay website catalogue — proposal (12 Sep 2026)

**Purpose.** The tagging catalogue (gender → category → sub-category) is also the
website's navigation. Every garment carries tags built from it, Shopify's
automated collections pick garments up by those tags, and the menu links to
the collections. Change the catalogue here, and the website follows.

Status: **proposal for Usman to approve.** Nothing below is in the database
yet. Existing sub-categories are marked *(have)*; everything else is new.
Broad ones to switch off once the specific ones exist are marked *(retire)*.

## How the tags will work

For a men's formal shirt tagged for summer the garment carries:

| Tag | Used for |
|---|---|
| `Men` | the top-level Men page |
| `Men Shirts` | the category page in the Men menu (**new tag**) |
| `Men Formal Shirt` | the sub-category page |
| `Formal Shirt` | cross-gender search / "all shirts" |
| `Summer`, `Summer Men`, `Summer Men Formal Shirt` | seasonal collections |
| `Kids`, `Teens`, `Toddlers`, `Infants` | band collections for children's wear |
| `POS only` / `Website` / `Draft` | channel (already in place) |

Menu: **Men → Shirts → Formal Shirts** is three collections with the rules
*tag equals `Men`*, *tag equals `Men Shirts`*, *tag equals `Men Formal Shirt`*.
Once approved, the app can create every collection and the menu itself
through Shopify's API, and keep them in step when a sub-category is added.

Children's wear: one catalogue for kids, teens, toddlers and infants; the
wearer picked on the tag form adds `Kids Boys` / `Infant Girls` / `Teens` and
so on, so the website can have Kids → Boys → T-Shirts and Kids → Baby.

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

## KIDS (boys, girls, teens, toddlers, infants share this catalogue)

**Tops** — T-shirt *(have)*, Polo shirt *(have)*, Shirt, Blouse, Tank top, Long sleeve T-shirt

**Bottoms** — Jeans, Trousers *(have)*, Shorts *(have)*, Leggings, Joggers / sweatpants *(have)*, Cargo pant

**Dresses & Skirts** — Dress *(have)*, Skirt *(have)*, Jumpsuit / romper, Party dress

**Sweaters & Hoodies** — Hoodie *(have)*, Sweatshirt *(have)*, Sweater *(have)*, Cardigan, Zip-up hoodie

**Jackets & Coats** — Puffer jacket *(have)*, Jacket *(have)*, Coat, Raincoat, Fleece

**Activewear** *(new category)* — Sports T-shirt, Sports shorts, Tracksuit, Sports leggings

**Nightwear** *(new category)* — Pajama set, Sleepsuit

**Baby** *(new category, infants and toddlers)* — Bodysuit / onesie, Romper, Sleepsuit, Baby set, Baby dress

---

## What each new sub-category needs

A three-letter code for the SKU, a weight, a selling profile, a value index
and a **cost per piece** — all copied from the nearest existing one in the
same category at creation, then adjusted in Pricing → Categories (or via the
Excel export). Retired ones are switched off, not deleted, so old garments
keep their names.

Totals if approved as written: Men 12 categories / ~85 sub-categories,
Women 16 / ~95, Kids 8 / ~35.
