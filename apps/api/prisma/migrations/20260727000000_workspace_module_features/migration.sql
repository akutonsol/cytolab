-- Workspace/module feature toggles: each enterprise workspace + standalone module
-- nav link now gates on its own FeatureKey. Additive enum values; they seed OFF
-- (not in BUILT_FEATURES), so the links stay hidden until a lab enables them.

ALTER TYPE "FeatureKey" ADD VALUE 'ANCILLARY_ORDERS';
ALTER TYPE "FeatureKey" ADD VALUE 'SCREENING_BATCHES';
ALTER TYPE "FeatureKey" ADD VALUE 'QUALITY_GOVERNANCE';
ALTER TYPE "FeatureKey" ADD VALUE 'OPERATIONS_HUB';
ALTER TYPE "FeatureKey" ADD VALUE 'ENTERPRISE_ADMINISTRATION';
ALTER TYPE "FeatureKey" ADD VALUE 'ENTERPRISE_CASE_MGMT';
