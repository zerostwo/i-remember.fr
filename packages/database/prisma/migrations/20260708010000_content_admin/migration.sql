-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('PUBLISHED', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MenuItemType" AS ENUM ('PAGE', 'MEMORY', 'SEARCH', 'EXTERNAL', 'TERMS', 'CREDITS', 'LANGUAGE');

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "language_code" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body_markdown" TEXT NOT NULL DEFAULT '',
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "linked_memory_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "language_code" TEXT NOT NULL DEFAULT 'en',
    "label" TEXT NOT NULL,
    "item_type" "MenuItemType" NOT NULL,
    "target_value" TEXT,
    "url" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "opens_new_tab" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "pages_language_code_slug_key" ON "pages"("language_code", "slug");

-- CreateIndex
CREATE INDEX "pages_status_updated_at_idx" ON "pages"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_language_code_uid_key" ON "menu_items"("language_code", "uid");

-- CreateIndex
CREATE INDEX "menu_items_language_code_position_idx" ON "menu_items"("language_code", "position");
