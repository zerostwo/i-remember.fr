import { createBackendForScripts } from "../src/server/revival.js";

const backend = createBackendForScripts();
const store = backend.store;

const counts = store.db
  .prepare(`
    select language_code, status, count(*) as count
    from memories
    group by language_code, status
    order by language_code, status
  `)
  .all();

console.log(`SQLite database: ${store.dbPath}`);
console.log(`Data directory: ${store.dataDir}`);
console.log("Memory counts:");
for (const row of counts) {
  console.log(`- ${row.language_code}/${row.status}: ${row.count}`);
}

store.close();
