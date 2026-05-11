import type { MemberPseudonym } from './pseudonymize';

export type BuildPromptInput = {
  projectName: string;
  projectDescription?: string | null;
  /** Pseudonymized project members — the LLM sees only SPEAKER_* labels and email_*@example.com tokens. */
  members: MemberPseudonym[];
  openTaskTitles?: string[];
  pseudonymizedTranscript: string;
  meetingEndDate: Date;
};

/**
 * Greek-aware prompt that asks the LLM to extract structured insights from a
 * pseudonymized Teams meeting transcript. Speaker labels are SPEAKER_A, SPEAKER_B
 * etc. and emails are email_N@example.com — the LLM does not see real names or emails.
 */
export function buildExtractionPrompt(input: BuildPromptInput): {
  system: string;
  user: string;
} {
  const { projectName, projectDescription, members, pseudonymizedTranscript, meetingEndDate } = input;
  const meetingDateIso = meetingEndDate.toISOString().slice(0, 10);

  const speakerLines = ['Μέλη του project (χρησιμοποίησε αυτά τα pseudonyms στις απαντήσεις):'];
  members.forEach((m) => {
    speakerLines.push(`  - ${m.speaker} → email: ${m.emailToken}`);
  });

  const taskLines: string[] = [];
  if (input.openTaskTitles?.length) {
    taskLines.push('Ήδη ανοιχτά tasks στο project (μην προτείνεις duplicates):');
    input.openTaskTitles.forEach((t) => taskLines.push(`  - ${t}`));
  }

  const system = `Είσαι assistant που αποδελτιώνει πρακτικά συσκέψεων (meeting transcripts).

Στόχος: από ένα ψευδωνυμοποιημένο transcript του Microsoft Teams, εξάγεις δομημένο JSON με:
  - περίληψη συνάντησης
  - αποφάσεις που πάρθηκαν
  - action items (tasks που πρέπει να γίνουν)
  - ρίσκα που εντοπίστηκαν
  - ανοιχτά ερωτήματα

ΚΑΝΟΝΕΣ:
1. Επιστρέφεις ΑΥΣΤΗΡΑ έγκυρο JSON, χωρίς markdown fences, χωρίς σχόλια.
2. Οι ομιλητές αναφέρονται ως SPEAKER_A, SPEAKER_B κ.λπ. ΜΗΝ μαντεύεις πραγματικά ονόματα.
3. Για assignee/owner/askedTo πεδία: βάλε το email_N@example.com token του μέλους που πιο πιθανά αναλαμβάνει, αν είναι ξεκάθαρο. Αν δεν είναι, βάλε null. ΜΗΝ προτείνεις άτομο που δεν είναι στη λίστα μελών. ΜΗΝ χρησιμοποιείς πραγματικά emails.
4. Για ημερομηνίες: ανέλυσε σχετικές αναφορές ("μέχρι Παρασκευή", "αύριο", "τέλος μήνα") σε απόλυτη ημερομηνία (YYYY-MM-DD), με βάση την ημερομηνία λήξης της συνάντησης: ${meetingDateIso}.
5. confidence ∈ [0,1]: 0.9+ μόνο αν ο ομιλητής δεσμεύτηκε ρητά. 0.6-0.8 για implicit commitments. Κάτω από 0.5 μην το συμπεριλάβεις καθόλου.
6. sourceQuote: αυτούσια φράση από το transcript που τεκμηριώνει το action item (max 200 χαρακτήρες).
7. sourceTimestampSec: τα timestamps στο transcript είναι σε format [MM:SS] στην αρχή κάθε γραμμής. Μετάτρεψέ τα σε δευτερόλεπτα.
8. ΜΗΝ εφευρίσκεις tasks. Αν δεν υπάρχει σαφής δέσμευση, μη γράφεις action item.

JSON SCHEMA που πρέπει να ακολουθήσεις ΑΚΡΙΒΩΣ:
{
  "summary": "string (2-4 παράγραφοι στα ελληνικά)",
  "decisions": [
    {
      "text": "string",
      "timestampSec": number,
      "participantEmails": ["email", ...]
    }
  ],
  "actionItems": [
    {
      "title": "string (σύντομος τίτλος task)",
      "description": "string (λεπτομέρειες)",
      "assigneeEmail": "email | null",
      "dueDate": "YYYY-MM-DD | null",
      "priority": "low | medium | high | urgent",
      "confidence": number,
      "sourceQuote": "string",
      "sourceTimestampSec": number
    }
  ],
  "risks": [
    {
      "text": "string",
      "severity": "low | medium | high",
      "ownerEmail": "email | null"
    }
  ],
  "openQuestions": [
    {
      "question": "string",
      "askedToEmail": "email | null",
      "askedByEmail": "email | null"
    }
  ]
}`;

  const user = `Project: ${projectName}${
    projectDescription ? `\nΠεριγραφή: ${projectDescription}` : ''
  }

${speakerLines.join('\n')}

${taskLines.join('\n')}

Ημερομηνία λήξης συνάντησης: ${meetingDateIso}

TRANSCRIPT (ψευδωνυμοποιημένο):
${pseudonymizedTranscript}

Επιστρέφεις μόνο το JSON object — τίποτε άλλο.`;

  return { system, user };
}
