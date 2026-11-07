import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const siteDir = path.resolve(process.argv[2] || "dist");
const html = fs.readFileSync(path.join(siteDir, "index.html"), "utf8");
const catalogMatch = html.match(/<script id="catalog-data" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(catalogMatch, "Catalog data is missing");
const catalog = JSON.parse(catalogMatch[1]);
assert.equal(catalog.title, "BLOCKSHELF");
assert.equal(catalog.items.length, catalog.productCount);
assert.equal(catalog.items.filter((item) => item.hasDwg).length, catalog.dwgCount);

let checkedFiles = 0;
for (const item of catalog.items) {
  for (const href of [item.preview, item.dwg].filter(Boolean)) {
    assert.ok(!/^(?:\/|[a-z]+:)/i.test(href), `Expected relative link: ${href}`);
    const file = path.resolve(siteDir, decodeURIComponent(href));
    const relative = path.relative(siteDir, file);
    assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), `Link escapes site: ${href}`);
    assert.ok(fs.statSync(file).size > 0, `Empty file: ${href}`);
    if (href.endsWith(".dwg")) {
      const header = Buffer.alloc(6);
      const handle = fs.openSync(file, "r");
      try {
        fs.readSync(handle, header, 0, header.length, 0);
      } finally {
        fs.closeSync(handle);
      }
      assert.match(header.toString("ascii"), /^AC\d{4}$/, `Invalid DWG header: ${href}`);
    }
    checkedFiles += 1;
  }
}

for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (!match[0].startsWith('<script id="catalog-data"')) new vm.Script(match[1]);
}

const zip = path.join(siteDir, catalog.allZip);
assert.ok(fs.statSync(zip).size > 0, "The full-library ZIP is missing");
const signature = Buffer.alloc(4);
const zipHandle = fs.openSync(zip, "r");
try {
  fs.readSync(zipHandle, signature, 0, signature.length, 0);
} finally {
  fs.closeSync(zipHandle);
}
assert.equal(signature.toString("hex"), "504b0304", "Invalid ZIP signature");
console.log(JSON.stringify({ modules: catalog.productCount, dwg: catalog.dwgCount, checkedFiles, zipBytes: fs.statSync(zip).size }));
