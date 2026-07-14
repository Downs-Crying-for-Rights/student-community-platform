-- CreateEnum
CREATE TYPE "DcrQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE');

-- CreateTable
CREATE TABLE "DcrQuizQuestion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "options" TEXT[],
    "type" "DcrQuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "answer" INTEGER[],
    "score" INTEGER NOT NULL DEFAULT 1,
    "explanation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DcrQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DcrTutorialChapter" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DcrTutorialChapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DcrQuizQuestion_active_idx" ON "DcrQuizQuestion"("active");

-- CreateIndex
CREATE INDEX "DcrTutorialChapter_order_idx" ON "DcrTutorialChapter"("order");
