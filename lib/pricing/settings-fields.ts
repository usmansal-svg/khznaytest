import type { Settings } from "@/lib/pricing/constants";

/** Every constant from spec sections 1–2, grouped the way the spec presents them. Shared by the Pricing screen and the Excel sheet. */
export const SETTINGS_FIELDS: { key: keyof Settings; label: string; unit?: string; step: number; group: string; help: string }[] = [
  { key: "fx", label: "Exchange rate", unit: "PKR per USD", step: 0.01, group: "Cost", help: "Update when you buy the next bale." },
  { key: "blendedRate", label: "Planning rate", unit: "USD per kg", step: 0.01, group: "Cost", help: "Used only for quotes with no lot selected. Real cost comes from each lot's own rate and yield." },
  { key: "defaultProvisionalYield", label: "Default provisional yield", unit: "0–1", step: 0.01, group: "Cost", help: "Share of bought kg assumed to reach a tag while a lot is open. 0.90 until three or four closed lots give a real number." },
  { key: "dutyPerKg", label: "Import duty", unit: "PKR per kg", step: 1, group: "Cost", help: "Charged on weight, so heavier garments carry more." },
  { key: "sortingPerPiece", label: "Sorting per piece", unit: "PKR", step: 1, group: "Cost", help: "Deliberately zero — sorting labour sits in overheads." },
  { key: "inputTaxRate", label: "Input sales tax", unit: "0–1", step: 0.01, group: "Tax", help: "Charged on top of the cost you enter (costs are entered before tax). Not charged on local-market lots." },
  { key: "inputTaxRecover", label: "Input tax recoverable", unit: "0–1", step: 0.01, group: "Tax", help: "Share you claim back against output tax; only the rest is a cost." },
  { key: "salesTax", label: "Sales tax on shelf price", unit: "0–1", step: 0.01, group: "Tax", help: "Shelf prices are tax inclusive." },
  { key: "targetGP", label: "Target gross profit", unit: "0–1 of ex-tax revenue", step: 0.01, group: "Margin", help: "The whole book aims here after markdowns, pulls and the grade mix." },
  { key: "rejectedShare", label: "Rejected at sorting", unit: "0–1", step: 0.01, group: "Margin", help: "Graded out before the floor." },
  { key: "bulkRecovery", label: "Bulk recovery", unit: "0–1 of cost", step: 0.01, group: "Margin", help: "What rejected and pulled stock fetches by weight." },
  { key: "charmStep", label: "Rounding step", unit: "PKR", step: 1, group: "Rounding", help: "Prices land on a multiple of this, plus the ending." },
  { key: "charmEnd", label: "Price ending", unit: "PKR", step: 1, group: "Rounding", help: "Every price ends in this. 90 means 1,290 not 1,300." },
  { key: "minPrice", label: "Minimum price", unit: "PKR", step: 10, group: "Rounding", help: "Floor for any grade at any markdown." },
  { key: "highValueThreshold", label: "High-value threshold", unit: "PKR", step: 100, group: "Control", help: "Items above this go to the QC review queue." },
  { key: "defaultDailyTarget", label: "Daily tagging target", unit: "garments per tagger", step: 5, group: "Control", help: "Shown to each tagger on the tag form; a personal target on the Staff page overrides it." },
  { key: "compareFactorRegular", label: "Compare-at factor · high street", unit: "× Premium price", step: 0.1, group: "Compare at", help: "Formula fallback for the tag's New in store price when no reference price exists: Premium shelf price × this. Thrift usually sells at 25–35% of new, so 3 ≈ 67% saving." },
  { key: "compareFactorAffordable", label: "Compare-at factor · affordable luxury", unit: "× Premium price", step: 0.1, group: "Compare at", help: "Same, for affordable-luxury brands." },
  { key: "qcSampleRate", label: "QC hold-back rate", unit: "0–1 (0.10 = one in ten)", step: 0.01, group: "Control", help: "Share of saved garments randomly held for a blind regrade. The tagger is told to set them aside; they cannot ship until a senior releases them." },
];
