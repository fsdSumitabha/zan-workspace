/**
 * Lets tests import src/lib/phone.ts under tsx.
 *
 * libphonenumber-js loads its data with require("../metadata.min.json").
 * Under tsx that path resolves to the sibling file "metadata.min.json.js",
 * an ES module whose data sits under `default`. The library then finds no
 * `countries` in it, and every parse throws. See also
 * src/scripts/region-migration/03-leads-phone.ts.
 *
 * This sends that one request to the real JSON file. Import it first in a
 * test file, before anything that imports the phone helpers. Tests only:
 * the app is built by Next.js, which resolves the JSON file correctly.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module") as {
    _resolveFilename: (request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) => string
}

const jsonPath = require.resolve("libphonenumber-js/metadata.min.json")
const original = Module._resolveFilename

Module._resolveFilename = function (request, parent, ...rest) {
    if (/^\.\.?\/(?:\.\.\/)*metadata\.(min|max|mobile)\.json$/.test(request) && parent?.filename?.includes("libphonenumber-js")) {
        const resolved = original.call(this, request, parent, ...rest)
        return resolved.endsWith(".json.js") ? resolved.slice(0, -3) : resolved
    }
    return original.call(this, request, parent, ...rest)
}

export { jsonPath as libphonenumberMetadataPath }
