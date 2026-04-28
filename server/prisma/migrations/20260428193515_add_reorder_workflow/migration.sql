-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('pending', 'approved', 'dismissed', 'completed', 'resolved');

-- AlterTable
ALTER TABLE "ReorderRecommendation" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currentQtySnapshot" DOUBLE PRECISION,
ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedById" INTEGER,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reorderThresholdSnapshot" DOUBLE PRECISION,
ADD COLUMN     "safetyStockSnapshot" DOUBLE PRECISION,
ADD COLUMN     "status" "RecommendationStatus" NOT NULL DEFAULT 'pending';

-- AddForeignKey
ALTER TABLE "ReorderRecommendation" ADD CONSTRAINT "ReorderRecommendation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderRecommendation" ADD CONSTRAINT "ReorderRecommendation_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderRecommendation" ADD CONSTRAINT "ReorderRecommendation_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
