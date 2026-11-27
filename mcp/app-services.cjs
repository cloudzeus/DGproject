// Bridge the stdio MCP process to the exact notification, Outlook and email
// rendering code used by the Next.js app. ts-node is already a project dev
// dependency; transpile-only keeps startup lightweight and preserves aliases.
let services = null;

function loadAppServices() {
  if (services) return services;

  require("ts-node").register({
    transpileOnly: true,
    compilerOptions: { module: "CommonJS", moduleResolution: "Node" },
  });
  require("tsconfig-paths/register");

  const { prisma } = require("../lib/prisma.ts");
  const { notifyTaskStatusChange } = require("../lib/notifications/index.ts");
  const { getMailFromAddress, sendMail } = require("../lib/graph-mail.ts");
  const { buildEmailTag, buildHiddenTagFooter } = require("../lib/email-tag.ts");
  const { emailLayout, quote, appUrl } = require("../lib/email-templates.ts");

  function renderResolutionEmail({ task, resolution, subject }) {
    const projectCode = task.project.projectCode;
    const routeTag = projectCode ? buildEmailTag(projectCode, task.id) : "";
    const emailSubject = subject?.trim() || `[${task.project.name}] Απάντηση: ${task.title}${routeTag ? ` ${routeTag}` : ""}`;
    // Resolutions are Markdown-ish plain text. Keep email rendering safe and
    // readable without requiring another runtime dependency or allowing raw HTML.
    const answerText = resolution.summary.replace(/\*\*/g, "").replace(/^- /gm, "• ");
    const layout = emailLayout({
      recipientName: null,
      header: {
        kicker: { text: "✓ Απάντηση", tone: "success" },
        eyebrow: { text: task.project.name, color: task.project.color },
        title: task.title,
      },
      body: quote({ body: answerText, tone: "success", caption: "Η απάντησή μας" }),
      actions: [{ label: "Άνοιγμα εργασίας", url: appUrl(`/projects/${task.projectId}?task=${task.id}`), variant: "primary" }],
      footerNote: "Η απάντηση διατηρείται και στο ιστορικό της εργασίας.",
    });

    return {
      subject: emailSubject,
      html: projectCode ? `${layout}\n${buildHiddenTagFooter(projectCode, task.id)}` : layout,
    };
  }

  services = { prisma, notifyTaskStatusChange, getMailFromAddress, sendMail, renderResolutionEmail };
  return services;
}

module.exports = { loadAppServices };
