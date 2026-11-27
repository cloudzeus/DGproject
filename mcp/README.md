# A-Sisyphus Project Tasks MCP

MCP server ενσωματωμένος απευθείας στο υπάρχον A-Sisyphus PMS. Δεν χρησιμοποιεί ξεχωριστή βάση ή αντίγραφα tasks: διαβάζει και γράφει στα πραγματικά Prisma models `Project`, `Task`, `Comment`, `Activity`, `TaskAssignee`, `TaskDependency` και `TaskResolution`.

## Προετοιμασία

1. Εγκατάσταση dependencies:

   ```bash
   npm install
   ```

2. Εφαρμογή migration και ανανέωση Prisma client:

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

3. Όρισε στο `.env` το email του Microsoft account με το οποίο έχεις κάνει login στο PMS:

   ```env
   MCP_OPERATOR_USER_EMAIL="email@company.gr"
   ```

   Ο server βρίσκει αυτόματα το αντίστοιχο `User.id`. Ο χρήστης πρέπει να είναι **άνθρωπος** και να έχει κάνει τουλάχιστον ένα login. Υποστηρίζεται και το παλιό `MCP_OPERATOR_USER_ID` ως εναλλακτικό· αν συμπληρωθεί το email, έχει προτεραιότητα.

   Το `DATABASE_URL` είναι το ίδιο με αυτό της εφαρμογής. Ο MCP server φορτώνει το `.env` από τον ριζικό φάκελο του project ανεξάρτητα από το working directory του AI client.

   Για το `send_task_resolution_email`, η προεπιλογή `MICROSOFT_MAIL_SEND_MODE=delegated` απαιτεί σύνδεση mailbox του operator από το `/profile`. Με `MICROSOFT_MAIL_SEND_MODE=application` η αποστολή γίνεται από το `SHARED_MAILBOX_ADDRESS` μέσω client credentials και απαιτεί Microsoft Graph **Application `Mail.Send`** με admin consent, χωρίς προσωπικό refresh token. Και στις δύο περιπτώσεις χρησιμοποιείται `saveToSentItems=true`. Αν αποτύχει το Graph, το tool επιστρέφει σφάλμα και καταγράφει `failed`, χωρίς fallback σε άλλο mailbox ή Mailgun.

## Εκκίνηση

```bash
npm run mcp:tasks
```

Ο server χρησιμοποιεί `stdio`. Δεν άνοιγε HTTP port και το stdout προορίζεται αποκλειστικά για το MCP πρωτόκολο.

## Σύνδεση MCP-compatible AI client

Παράδειγμα ρύθμισης, αντικαθιστώντας το path και το Microsoft email σου:

```json
{
  "mcpServers": {
    "a-sisyphus-tasks": {
      "command": "node",
      "args": [
        "/absolute/path/to/DGproject/mcp/index.mjs"
      ],
      "env": {
        "MCP_OPERATOR_USER_EMAIL": "email@company.gr"
      }
    }
  }
}
```

Σε κάθε νέο AI session, το πρώτο βήμα είναι:

```text
Register agent with agent_key "my-ai" and display_name "My AI".
Then list the available PMS projects.
```

Το `agent_key` πρέπει να είναι σταθερό, με 2–49 χαρακτήρες: πεζά γράμματα, αριθμούς, τελείες, underscores ή παύλες.

## Προτεινόμενη ροή

1. `list_projects` → ο χρήστης επιλέγει project. Εναλλακτικά, `create_project` δημιουργεί νέο πραγματικό PMS project.
2. `get_project_context` και `list_tasks` → το AI παρουσιάζει τα πραγματικά tasks.
3. Ο χρήστης επιλέγει tasks → `assign_tasks` με το `agent_key` του AI.
4. `get_task` → πλήρες πακέτο με dependencies, σχόλια, attachments και προηγούμενα resolutions.
5. `list_files` και `read_file` → ανάγνωση εγγράφων ή screenshots του task.
6. `start_task` → απορρίπτεται αν κάποιο dependency δεν είναι `done`.
7. `report_progress`, `add_task_comment`, `report_blocker` → ενημέρωση του PMS feed.
8. `upload_file` → ανέβασμα αποτελεσμάτων, logs ή screenshots στο task· διαθέσιμο και για project-level αρχεία.
9. `submit_resolution` → το task μεταβαίνει σε `review`.
10. Ο χρήστης καλεί είτε `request_changes` είτε `approve_resolution`.
11. Μόνο αφού ο χρήστης επιβεβαιώσει παραλήπτες, `send_task_resolution_email` στέλνει την τελευταία submitted/approved απάντηση από το configured Outlook mailbox και την καταγράφει στο project Email history με τον πραγματικό αποστολέα.

Κάθε MCP αλλαγή status περνά από το ίδιο `notifyTaskStatusChange` με το UI, ώστε να εκτελούνται και οι υπάρχουσες ειδοποιήσεις PMS/portal/ticket. Η αποθήκευση resolution **δεν ισοδυναμεί από μόνη της με αποστολή email**.

Παράδειγμα εντολής προς AI:

```text
Σύνδεσου ως agent "kimi-main". Δείξε μου τα projects του PMS.
Όταν επιλέξω project, παρουσίασε τα todo tasks και περίμενε να σου πω
ποια θέλω να αναθέσω. Μην ξεκινήσεις κάποιο χωρίς δική μου εντολή.
```

Παράδειγμα δημιουργίας project:

```text
Δημιούργησε ένα εσωτερικό project με όνομα "Customer Portal",
περιγραφή "Νέο portal πελατών" και χρώμα "#0078D4".
```

Το AI καλεί `create_project` με `name`, `description`, `color` και `is_internal: true`. Αν δεν δοθεί `workspace_id`, χρησιμοποιείται το πρώτο workspace του configured operator ή δημιουργείται `Default Workspace`.

## Διαθέσιμα tools

| Tool | Λειτουργία |
|---|---|
| `register_agent` | Δημιουργία/μετονομασία AI agent ως PMS user με `isAIAgent=true` |
| `list_agents` | Λίστα registered AI agents |
| `list_projects` | Πραγματικά PMS projects και tasks |
| `create_project` | Νέο PMS project με owner/member τον operator, αυτόματο project code και προαιρετικό workspace |
| `get_project_context` | Workspace, μέλη, tasks και attachments project |
| `list_tasks` | Tasks με φίλτρα status/priority/agent |
| `get_task` | Πλήρες task package και resolution history |
| `get_task_feed` | Ενιαίο feed comments, activities και resolutions |
| `list_files` | Attachments ενός task ή όλων των tasks/ενός project |
| `read_file` | Κείμενο inline, screenshot ως MCP image και λοιπά binary ως embedded resource |
| `upload_file` | Upload έως 10 MiB σε project ή assigned task, με text ή base64, στο υπάρχον Bunny CDN |
| `upload_task_attachment` | Upload τοπικού αρχείου έως 10 MiB σε assigned task με `file_path`, χωρίς base64 |
| `create_task` | Νέο PMS task με acceptance criteria, related files και dependencies |
| `update_task` | Ενημέρωση `estimatedHours` και προσθαφαίρεση dependencies σε υπάρχον assigned task |
| `assign_tasks` | Ορατή ανάθεση στον operator και εσωτερικό active assignment στον agent |
| `start_task` | Έναρξη ή resume με dependency checks |
| `release_task` | Απελευθέρωση ανάθεσης και επιστροφή σε `todo` |
| `report_progress` | Internal progress comment |
| `add_task_comment` | Internal ή shared comment με συγγραφέα τον operator |
| `report_blocker` | Καταγραφή blocker στο task και στο feed |
| `submit_resolution` | Νέα resolution attempt και μετάβαση σε `review` |
| `request_changes` | Απόρριψη attempt με feedback και επιστροφή στον agent |
| `approve_resolution` | Έγκριση από operator και μετάβαση σε `done` |
| `send_task_resolution_email` | Πραγματική αποστολή resolution μέσω Outlook με επιβεβαιωμένους παραλήπτες, audit και duplicate protection |

## Αρχεία και screenshots

- Στο `upload_file` δίνεται ακριβώς ένα από `task_id`/`project_id` και ακριβώς ένα από `text_content`/`content_base64`.
- Στο `upload_task_attachment` δίνονται `task_id`, `agent_key` και απόλυτο `file_path` προσβάσιμο από τη διεργασία του MCP server. Το αρχείο διαβάζεται απευθείας από τον δίσκο, χωρίς base64 στο request ή στο response. Τα `file_name` και `mime_type` είναι προαιρετικά· ανιχνεύονται από το αρχείο.
- Για task απαιτείται ενεργή ανάθεση στον agent. Σε project μπορεί να ανεβάσει registered agent.
- Τα uploads είναι `internal` από default και καταγράφονται ως PMS `Attachment` και `Activity` με uploader/actor τον operator.
- Το `read_file` επιτρέπει HTTPS downloads μόνο από το configured Bunny CDN hostname. Επιπλέον hosts ορίζονται, χωρισμένοι με κόμμα, στο `MCP_ATTACHMENT_ALLOWED_HOSTS`.
- OneDrive/SharePoint links χρειάζονται δημόσια προσβάσιμο περιεχόμενο και ρητή προσθήκη του host στην allowlist· το MVP δεν εκτελεί Microsoft Graph OAuth.
- Το όριο upload/download είναι 10 MiB. SVG αντιμετωπίζεται ως κείμενο και όχι ως ενσωματωμένη εικόνα.

## Ενημερώσεις task και σχόλια

- Το `add_task_comment` δέχεται `visibility: "internal" | "shared"` με default `internal`. Η τιμή `shared` αποθηκεύεται στο πραγματικό `Comment.visibility` και εμφανίζει το σχόλιο στο customer portal.
- Το `update_task` απαιτεί `task_id`, `agent_key` και τουλάχιστον `hours` ή μια αλλαγή στα `dependencies.add`/`dependencies.remove`. Το `hours` γράφει στο `Task.estimatedHours`. Οι εξαρτήσεις πρέπει να ανήκουν στο ίδιο project· απορρίπτονται αυτοαναφορές και κύκλοι, ενώ επαναληπτική προσθήκη δεν δημιουργεί διπλότυπα.

## Αντιστοίχιση με το υπάρχον PMS

- Ο configured operator είναι ο ορατός assignee, συγγραφέας comments/activities, uploader και resolution author. Ο AI agent δεν εμφανίζεται ως συνεργάτης στα tasks ή στα resolutions.
- Το `Task.activeAIAgentId` και το `agent_key` χρησιμοποιούνται μόνο για το εσωτερικό active assignment και τον authorization έλεγχο της ροής.
- Το blocker αποθηκεύεται στο `Task.aiBlockedReason` χωρίς νέο status που θα διέσπαγε το Kanban.
- Κάθε resolution attempt είναι ξεχωριστό `TaskResolution`. Τα rejected attempts δεν διαγράφονται.
- Progress, blockers και review feedback είναι κανονικά internal `Comment` records.
- Οι αλλαγές καταγράφονται και ως `Activity` με actor τον operator.
- Η έγκριση τηρεί τον κανόνα owner/designated approver/admin του PMS και ενημερώνει τον υπάρχοντα in-progress timer.

## Δοκιμές

```bash
# Workflow + πραγματικό MCP protocol, χωρίς εγγραφές στη βάση
npm run mcp:tasks:test

# Πλήρης integration ροή στη ρυθμισμένη MySQL.
# Δημιουργεί προσωρινό operator/agent/workspace/project/tasks και τα διαγράφει στο finally.
npm run mcp:tasks:test:db
```

## Όρια ασφάλειας του MVP

Η σύνδεση `stdio` προορίζεται για τοπική, έμπιστη χρήση. Το `MCP_OPERATOR_USER_EMAIL` (ή το εναλλακτικό `MCP_OPERATOR_USER_ID`) επιλέγει τον ορατό PMS actor, ενώ το `agent_key` επιλέγει το εσωτερικό active assignment. Αυτά δεν αποτελούν authentication: ένας συνδεδεμένος client μπορεί να δηλώσει άλλο agent key. Για απομακρυσμένη ή multi-user χρήση χρειάζεται authenticated transport, ανά-χρήστη authorization και περιορισμένα database credentials.
