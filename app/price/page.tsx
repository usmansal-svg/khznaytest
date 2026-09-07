import { PriceTester } from "@/components/price-tester";

export default function PricePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-bold">Price a garment</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Every figure comes from <code>POST /api/price</code> — nothing is computed in the browser.
      </p>
      <PriceTester />
    </main>
  );
}
