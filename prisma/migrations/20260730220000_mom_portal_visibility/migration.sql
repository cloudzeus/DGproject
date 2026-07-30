-- Δημοσίευση πρακτικών σύσκεψης στο portal πελατών.
--
-- Παρήχθη με `prisma migrate diff` (το shadow DB δεν λειτουργεί). Οι δύο γραμμές
-- `DROP INDEX ... _fulltext` που έβγαλε το diff ΑΦΑΙΡΕΘΗΚΑΝ σκόπιμα: τα FULLTEXT
-- indexes σε KnowledgeEntry και Task δεν εκφράζονται στο schema, οπότε το diff τα
-- θεωρεί περίσσευμα. Αν πέσουν, σπάει σιωπηλά το triage των αιτημάτων.

-- AlterTable
ALTER TABLE `MeetingNote` ADD COLUMN `momSharedAt` DATETIME(3) NULL,
    ADD COLUMN `momSharedById` VARCHAR(191) NULL,
    ADD COLUMN `momSharedInclude` JSON NULL,
    ADD COLUMN `momVisibility` ENUM('internal', 'shared') NOT NULL DEFAULT 'internal';

-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('mention', 'assignment', 'due_soon', 'comment', 'status_change', 'question', 'answer', 'approval', 'ticket', 'meeting') NOT NULL;
