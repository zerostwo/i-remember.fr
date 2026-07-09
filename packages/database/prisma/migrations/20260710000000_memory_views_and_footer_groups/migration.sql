ALTER TYPE "MenuItemType" ADD VALUE IF NOT EXISTS 'GROUP';
ALTER TYPE "MenuItemType" ADD VALUE IF NOT EXISTS 'SOUND';
ALTER TYPE "MenuItemType" ADD VALUE IF NOT EXISTS 'SHARE';
ALTER TYPE "MenuItemType" ADD VALUE IF NOT EXISTS 'LOGO';

ALTER TABLE "memories" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "menu_items" (
  "id", "uid", "language_code", "label", "item_type", "target_value", "url",
  "position", "is_visible", "opens_new_tab", "metadata", "created_at", "updated_at"
)
SELECT * FROM (VALUES
  ('footer-default-logo', 'footer-logo', 'en', 'Logo', 'LOGO'::"MenuItemType", NULL, NULL, 10, true, false, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('footer-default-sound', 'footer-sound', 'en', 'Sound', 'SOUND'::"MenuItemType", NULL, NULL, 20, true, false, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('footer-default-share', 'footer-share', 'en', 'Share', 'SHARE'::"MenuItemType", NULL, NULL, 30, true, false, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('footer-default-donate', 'footer-donate', 'en', 'Donate', 'EXTERNAL'::"MenuItemType", NULL, 'https://www.frm.org/', 40, true, true, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('footer-default-terms', 'footer-terms', 'en', 'Terms', 'TERMS'::"MenuItemType", 'terms', NULL, 50, true, false, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('footer-default-credits', 'footer-credits', 'en', 'Credits', 'CREDITS'::"MenuItemType", 'credits', NULL, 60, true, false, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('footer-default-language', 'footer-language', 'en', 'Language', 'LANGUAGE'::"MenuItemType", NULL, NULL, 70, true, false, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS defaults(
  "id", "uid", "language_code", "label", "item_type", "target_value", "url",
  "position", "is_visible", "opens_new_tab", "metadata", "created_at", "updated_at"
)
WHERE NOT EXISTS (SELECT 1 FROM "menu_items");
