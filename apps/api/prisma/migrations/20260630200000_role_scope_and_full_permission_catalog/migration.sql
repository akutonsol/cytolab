-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('User', 'Workspace');

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "scope" "RoleScope" NOT NULL DEFAULT 'User';

