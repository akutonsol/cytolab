-- CreateEnum
CREATE TYPE "AuthorizerDesignation" AS ENUM ('Pathologist', 'Cytologist');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authorizerDesignation" "AuthorizerDesignation";

