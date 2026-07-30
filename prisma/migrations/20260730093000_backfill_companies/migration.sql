-- Backfill: συνδέει τους υπάρχοντες χρήστες με εγγραφές Company.
--
-- Οι περισσότερες εταιρίες υπάρχουν ήδη από τη μαζική εισαγωγή SoftOne (κλειδί
-- TRDR). Εδώ (α) δημιουργούμε εταιρίες για ΑΦΜ που δεν καλύφθηκαν, και (β)
-- συνδέουμε κάθε χρήστη με την εταιρία του ΑΦΜ του.
--
-- Το AFM ΔΕΝ είναι unique — 56 ΑΦΜ έχουν πολλές καρτέλες. Η επιλογή γίνεται
-- ντετερμινιστικά (ενεργή, μικρότερο id) ώστε να μη διαφέρει μεταξύ εκτελέσεων.
--
-- Ιδιαίτερη περίπτωση: ΑΦΜ εκτός Ελλάδας μπορεί να περιέχει γράμματα (π.χ. το
-- κυπριακό "10347430N"). Δεν κανονικοποιούνται και δεν επικυρώνονται εδώ — αν
-- δεν ταιριάξουν, ο χρήστης μένει ασύνδετος, που είναι η σωστή fail-closed
-- συμπεριφορά για το portal.

-- (α) Εταιρίες για ΑΦΜ χρηστών που δεν υπάρχουν ήδη.
INSERT INTO `Company` (`id`, `NAME`, `AFM`, `SODTYPE`, `ISACTIVE`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('cmp', REPLACE(UUID(), '-', '')),
  COALESCE(MIN(NULLIF(TRIM(u.`companyName`), '')), u.`companyAfm`),
  u.`companyAfm`,
  13,
  1,
  NOW(3),
  NOW(3)
FROM `User` u
WHERE u.`companyAfm` IS NOT NULL
  AND TRIM(u.`companyAfm`) <> ''
  AND NOT EXISTS (SELECT 1 FROM `Company` c WHERE c.`AFM` = u.`companyAfm`)
GROUP BY u.`companyAfm`;

-- (β) Σύνδεση χρηστών. Μία εταιρία ανά ΑΦΜ, ντετερμινιστικά επιλεγμένη.
UPDATE `User` u
JOIN (
  SELECT `AFM`, MIN(`id`) AS `id`
  FROM `Company`
  WHERE `AFM` IS NOT NULL
    AND TRIM(`AFM`) <> ''
    AND `ISACTIVE` = 1
  GROUP BY `AFM`
) c ON c.`AFM` = u.`companyAfm`
SET u.`companyId` = c.`id`
WHERE u.`companyId` IS NULL;

-- (γ) Ο πελάτης κάθε έργου από την εταιρία της επαφής-πελάτη.
-- Σήμερα no-op (κανένα έργο δεν έχει customerUserId), αλλά το κρατάμε ώστε το
-- migration να είναι σωστό αν εφαρμοστεί σε βάση που έχει.
UPDATE `Project` p
JOIN `User` u ON u.`id` = p.`customerUserId`
SET p.`primaryCompanyId` = u.`companyId`
WHERE p.`primaryCompanyId` IS NULL
  AND u.`companyId` IS NOT NULL;
