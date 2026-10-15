ALTER TABLE "memories" ADD COLUMN "map_key" TEXT;
UPDATE "memories" SET "map_key" = "public_id";
ALTER TABLE "memories" ALTER COLUMN "map_key" SET NOT NULL;
CREATE TABLE "memory_links" (
  "public_id" TEXT NOT NULL PRIMARY KEY,
  "memory_id" TEXT NOT NULL REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "memory_links_memory_id_idx" ON "memory_links"("memory_id");
INSERT INTO "memory_links" ("public_id", "memory_id") SELECT "public_id", "id" FROM "memories";
