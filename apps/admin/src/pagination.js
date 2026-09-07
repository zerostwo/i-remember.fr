// Fetch every page for owner search/export. The list UI can page this complete collection.
export async function collectPages(request, path, options = {}) {
  const records = [];
  const cursors = new Set();
  let cursor = null;
  do {
    const url = new URL(path, "http://local");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const result = await request(`${url.pathname}${url.search}`, { ...options, envelope: true });
    if (!Array.isArray(result.data)) throw new Error("Invalid paginated response");
    records.push(...result.data);
    cursor = result.pagination?.nextCursor || null;
    if (cursor && cursors.has(cursor)) throw new Error("Pagination did not advance");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...new Map(records.map((item) => [item.id, item])).values()];
}
