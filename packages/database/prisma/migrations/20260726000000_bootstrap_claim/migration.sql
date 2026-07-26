CREATE TABLE "bootstrap_claims" (
    "key" TEXT NOT NULL,
    "user_id" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bootstrap_claims_pkey" PRIMARY KEY ("key")
);
