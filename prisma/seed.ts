import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import axios from 'axios';
import FormData from 'form-data';

const prisma = new PrismaClient();

// Bunny CDN upload function
async function uploadToCDN(filename: string, content: Buffer, folder: string) {
  try {
    const storageApi = axios.create({
      baseURL: `https://${process.env.BUNNY_STORAGE_ZONE}.${process.env.BUNNY_STORAGE_API_HOST}`,
      headers: {
        'AccessKey': process.env.BUNNY_ACCESS_KEY,
      },
    });

    const uploadPath = `${folder}/${filename}`;

    const response = await storageApi.put(
      `/${process.env.BUNNY_STORAGE_ZONE}/${uploadPath}`,
      content,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const cdnUrl = `https://${process.env.BUNNY_CDN_HOSTNAME}/${uploadPath}`;
    console.log('✅ Data uploaded to Bunny CDN:', cdnUrl);
    return cdnUrl;
  } catch (error) {
    console.error('⚠️  CDN upload skipped (check CDN config):', error instanceof Error ? error.message : error);
    return null;
  }
}

async function main() {
  console.log('🌱 Seeding database with SoftOne ERP data in Greek...');

  // Create demo users with Greek names
  const users = [
    {
      email: 'gkozyris@i4ria.com',
      password: '1f1femsk',
      name: 'Γεώργιος Κοζύρης',
      role: 'admin' as const,
    },
    {
      email: 'admin@softone.gr',
      password: 'password123',
      name: 'Αντώνιος Παπαδόπουλος',
      role: 'admin' as const,
    },
    {
      email: 'manager@softone.gr',
      password: 'password123',
      name: 'Μαρία Ευαγγέλου',
      role: 'manager' as const,
    },
    {
      email: 'accountant@softone.gr',
      password: 'password123',
      name: 'Νικόλαος Δημητρίου',
      role: 'member' as const,
    },
    {
      email: 'sales@softone.gr',
      password: 'password123',
      name: 'Σοφία Χριστοφορίδη',
      role: 'member' as const,
    },
    {
      email: 'inventory@softone.gr',
      password: 'password123',
      name: 'Γιάννης Μιχαηλίδης',
      role: 'member' as const,
    },
  ];

  for (const userData of users) {
    const hashedPassword = await bcryptjs.hash(userData.password, 10);
    
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        role: userData.role,
      },
    });

    console.log(`✅ Χρήστης δημιουργήθηκε: ${user.email} (${user.role})`);
  }

  // Get all users
  const admin = await prisma.user.findUnique({
    where: { email: 'gkozyris@i4ria.com' },
  });
  
  const accountant = await prisma.user.findUnique({
    where: { email: 'accountant@softone.gr' },
  });
  
  const sales = await prisma.user.findUnique({
    where: { email: 'sales@softone.gr' },
  });
  
  const inventory = await prisma.user.findUnique({
    where: { email: 'inventory@softone.gr' },
  });

  if (admin) {
    // Find or create workspace for SoftOne
    let workspace = await prisma.workspace.findFirst({
      where: { ownerId: admin.id, name: 'SoftOne ERP' },
    });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: 'SoftOne ERP',
          description: 'Διαχείριση εργασιών SoftOne ERP - Ολοκληρωμένο σύστημα διαχείρισης επιχείρησης',
          ownerId: admin.id,
        },
      });
    }

    if (workspace) {
      console.log(`✅ Χώρος εργασίας: ${workspace.name}`);

      // SoftOne ERP Projects
      const softoneProjects = [
        {
          name: 'Λογιστικά - Δημιουργία Λογαριασμών',
          description: 'Ρύθμιση λογαριασμών γενικής λογιστικής, κωδικοποίηση ΕΦ/ΦΠΑ, σχέδιο λογαριασμών',
          status: 'active' as const,
          color: '#0078D4',
          icon: '📊',
          ownerId: admin.id,
          tasks: [
            'Δημιουργία κωδικοποίησης λογαριασμών',
            'Ρύθμιση κέντρων κόστους',
            'Εισαγωγή προϋπολογισμού',
            'Ρύθμιση ΦΠΑ και εισφορών',
            'Δοκιμαστικό ισοζύγιο',
          ],
        },
        {
          name: 'Αποθήκη - Δημιουργία Καταλόγου Προϊόντων',
          description: 'Ορισμός κατηγοριών προϊόντων, τιμολόγηση, μέθοδος αποτίμησης αποθέματος',
          status: 'active' as const,
          color: '#107C10',
          icon: '📦',
          ownerId: inventory?.id || admin.id,
          tasks: [
            'Δημιουργία κατηγοριών προϊόντων',
            'Εισαγωγή κωδικών προϊόντων',
            'Ρύθμιση τιμών και χρεώσεων',
            'Καθορισμός μονάδων μέτρησης',
            'Εισαγωγή αρχικού αποθέματος',
          ],
        },
        {
          name: 'Πωλήσεις - Δημιουργία Πελατολογίου',
          description: 'Εγγραφή πελατών, ορισμός τιμολογίων, όρων πληρωμής',
          status: 'active' as const,
          color: '#8764B8',
          icon: '💰',
          ownerId: sales?.id || admin.id,
          tasks: [
            'Δημιουργία αρχείου πελατών',
            'Ορισμός σειρών τιμολογίων',
            'Ρύθμιση συμφωνημένων τιμών',
            'Καθορισμός όρων πληρωμής',
            'Ενεργοποίηση αυτόματης αρίθμησης',
          ],
        },
        {
          name: 'Αγορές - Δημιουργία Προμηθευτολογίου',
          description: 'Εγγραφή προμηθευτών, όροι συνεργασίας, ιστορικό παραγγελιών',
          status: 'planning' as const,
          color: '#C239B3',
          icon: '🤝',
          ownerId: admin.id,
          tasks: [
            'Δημιουργία αρχείου προμηθευτών',
            'Ορισμός σειρών δελτίων αποστολής',
            'Ρύθμιση τιμών προμηθευτών',
            'Καθορισμός όρων πληρωμής',
            'Σύνδεση με λογαριασμούς',
          ],
        },
        {
          name: 'CRM - Διαχείριση Σχέσεων Πελατών',
          description: 'Παρακολούθηση εργασιών, δυνατότητες, προσφορών και συμβάσεων',
          status: 'planning' as const,
          color: '#D83B01',
          icon: '👥',
          ownerId: sales?.id || admin.id,
          tasks: [
            'Ορισμός σταδίων πωλήσεων',
            'Δημιουργία τύπων εργασιών',
            'Ρύθμιση σημάτων και κατηγοριών',
            'Δημιουργία προτύπων εγγράφων',
            'Σύνδεση με ημερολόγιο',
          ],
        },
        {
          name: 'Ανθρώπινο Δυναμικό - Ρύθμιση Σύστηματος',
          description: 'Ορισμός θέσεων εργασίας, κλάδων, βαθμολογίων, επιδόματα',
          status: 'on_hold' as const,
          color: '#498205',
          icon: '👨‍💼',
          ownerId: admin.id,
          tasks: [
            'Δημιουργία οργανογράμματος',
            'Ορισμός θέσεων εργασίας',
            'Ρύθμιση κλιμακών αποδοχών',
            'Καθορισμός επιδομάτων',
            'Ορισμός εργασιακών συμβάσεων',
          ],
        },
      ];

      for (const projectData of softoneProjects) {
        const { tasks, ...projData } = projectData;
        
        let project = await prisma.project.findFirst({
          where: { workspaceId: workspace.id, name: projData.name },
        });

        if (!project) {
          project = await prisma.project.create({
            data: {
              ...projData,
              workspaceId: workspace.id,
            },
          });
        }

        if (project) {
          console.log(`✅ Έργο: ${project.name}`);

          // Create tasks for this project
          const taskStatuses = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
          const priorities = ['low', 'medium', 'high', 'urgent'] as const;

          for (let i = 0; i < tasks.length; i++) {
            const taskId = `${project.id}-task-${i}`;
            const existingTask = await prisma.task.findUnique({ where: { id: taskId } });

            if (!existingTask) {
              await prisma.task.create({
                data: {
                  id: taskId,
                  projectId: project.id,
                  title: tasks[i],
                  description: `Εργασία για ${project.name} - Μέρος ${i + 1} από ${tasks.length}`,
                  status: taskStatuses[i % taskStatuses.length],
                  priority: priorities[i % priorities.length],
                  order: i,
                  createdById: admin.id,
                  dueDate: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000),
                },
              });
            }
          }

          console.log(`   ✅ ${tasks.length} εργασίες δημιουργήθηκαν`);

          // Export project data to Bunny CDN
          const projectData = {
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            progress: project.progress,
            workspace: workspace.name,
            owner: admin.name,
            createdAt: new Date().toISOString(),
            taskCount: tasks.length,
            tasks: tasks.slice(0, 5).map((title, idx) => ({
              title,
              status: taskStatuses[idx % taskStatuses.length],
              priority: priorities[idx % priorities.length],
            })),
          };

          const cdnUrl = await uploadToCDN(
            `project-${project.id}-seed.json`,
            Buffer.from(JSON.stringify(projectData, null, 2)),
            'pms/projects'
          );

          if (cdnUrl) {
            await prisma.attachment.upsert({
              where: { id: `seed-export-${project.id}` },
              update: {},
              create: {
                id: `seed-export-${project.id}`,
                projectId: project.id,
                name: 'Αρχική Εξαγωγή Έργου',
                size: Buffer.from(JSON.stringify(projectData, null, 2)).length,
                mimeType: 'application/json',
                url: cdnUrl,
                source: 'local' as const,
                uploadedById: admin.id,
              },
            }).catch(() => {
              console.log('⚠️  Αναφορά εξαγωγής υπάρχει ήδη');
            });
          }
        }
      }
    }
  }

  console.log('✅ Seeding SoftOne ERP δεδομένων ολοκληρώθηκε!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding ξέσπασε σφάλμα:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
