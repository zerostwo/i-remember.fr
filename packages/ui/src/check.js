import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
for (const name of ["Button", "Card", "Field", "Select", "Switch", "Table", "Tabs", "Textarea"]) {
  assert.match(source, new RegExp(`\\b${name}\\b`));
}

console.log("ui exports ok");
