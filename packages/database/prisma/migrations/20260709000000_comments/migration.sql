-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('NORMAL', 'PENDING', 'ARCHIVED', 'REJECTED');

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "memory_id" TEXT,
    "author_name" TEXT NOT NULL DEFAULT 'Anonymous',
    "author_email" TEXT,
    "content" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_status_created_at_idx" ON "comments"("status", "created_at");

-- CreateIndex
CREATE INDEX "comments_memory_id_idx" ON "comments"("memory_id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
