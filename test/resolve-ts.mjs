/**
 * Lets `node --test` resolve the imports the rest of the codebase uses
 * (Next.js and tsc resolve them natively; plain Node ESM does not):
 *
 *   - extensionless relative imports        ./constants -> ./constants.ts
 *   - the tsconfig "@/*" alias              @/lib/x     -> <repo>/lib/x.ts
 *   - bare subpaths of packages that ship   next/server -> next/server.js
 *     no "exports" map (Next.js is one)
 *
 * Keeps the source idiomatic instead of littering it with specifiers that
 * only exist to satisfy the test runner. Node 24 strips the TypeScript types
 * itself, so there is no build step and no test-framework dependency.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);
const hasExtension = (s) => /\.[a-z]+$/i.test(s);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      specifier = new URL(specifier.slice(2), ROOT).href;
    }

    const isLocal = specifier.startsWith(".") || specifier.startsWith("file:");
    if (isLocal && !hasExtension(specifier)) {
      const base = new URL(specifier, context.parentURL);
      for (const candidate of [`${base.href}.ts`, `${base.href}/index.ts`]) {
        if (existsSync(fileURLToPath(candidate))) {
          return { url: pathToFileURL(fileURLToPath(candidate)).href, shortCircuit: true };
        }
      }
    }

    try {
      return nextResolve(specifier, context);
    } catch (err) {
      // A bare subpath with no extension and no "exports" entry: retry as .js.
      if (err?.code === "ERR_MODULE_NOT_FOUND" && !isLocal && !hasExtension(specifier)) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw err;
    }
  },
});
