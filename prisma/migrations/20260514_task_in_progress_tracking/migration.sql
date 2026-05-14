-- Track wall-clock duration spent in status=in_progress per task.
-- The clock ticks while inProgressStartedAt is non-null; when status leaves
-- in_progress the elapsed delta is folded into inProgressAccumulatedMs.
ALTER TABLE `Task`
  ADD COLUMN `inProgressStartedAt` DATETIME(3) NULL,
  ADD COLUMN `inProgressAccumulatedMs` BIGINT NOT NULL DEFAULT 0;

-- Backfill: any task currently sitting in in_progress gets its clock started
-- from the last updatedAt so we don't lose work already underway.
UPDATE `Task`
   SET `inProgressStartedAt` = `updatedAt`
 WHERE `status` = 'in_progress';
