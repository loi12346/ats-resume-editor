import type { ResumeData } from "./types";

export const starterResume: ResumeData = {
  contact: {
    fullName: "Your Name",
    headline: "Target Role | Core Strength | Industry Focus",
    location: "City, Country",
    email: "email@example.com",
    phone: "+00 000 0000",
    links: "LinkedIn | Portfolio | GitHub",
  },
  summary:
    "Commercial and product-minded operator with experience across customer-facing work, project execution, and hands-on AI tooling. Strong at turning messy requirements into clear workflows, stakeholder updates, and measurable outcomes.",
  hardSkills: [
    "CRM",
    "Pipeline tracking",
    "Data analysis",
    "Workflow automation",
    "Next.js",
    "TypeScript",
    "SQLite",
    "AI workflow prototyping",
  ],
  softSkills: [
    "Customer success",
    "Account management",
    "Renewals",
    "Stakeholder management",
    "Product operations",
    "Cross-functional coordination",
  ],
  languages: [],
  experience: [
    {
      id: "exp-1",
      organization: "Company Name",
      role: "Role Title",
      location: "City, Country",
      start: "MMM YYYY",
      end: "Present",
      keywords: "Customer Success, Sales, CRM",
      impact: "Add revenue, retention, adoption, or efficiency numbers here.",
      originalDescription:
        "Paste your raw work experience here. Keep messy notes if needed; refine the bullets below.",
      bullets: [
        "Managed customer-facing workflows across onboarding, follow-up, issue resolution, and stakeholder communication.",
        "Maintained structured records in CRM to improve visibility across pipeline, renewal status, and next actions.",
        "Coordinated with internal teams to turn customer requirements into clear action plans and timely updates.",
      ],
    },
  ],
  projects: [
    {
      id: "proj-1",
      organization: "Resume Editor",
      role: "Personal AI/Product Project",
      location: "Local Web App",
      start: "May 2026",
      end: "May 2026",
      keywords: "Next.js, SQLite, ATS, Automation",
      impact: "Built a local resume system with structured editing, versioning, and downloads.",
      originalDescription:
        "A non-work project for editing targeted resume versions without using Word.",
      bullets: [
        "Designed a structured resume editor that separates raw notes, refined bullets, target role keywords, and downloadable formats.",
        "Implemented local version management so each target role can keep a distinct summary, skill set, and experience ordering.",
      ],
    },
  ],
  education: [
    {
      id: "edu-1",
      school: "University / School",
      degree: "Degree / Certification",
      location: "City, Country",
      start: "MMM YYYY",
      end: "MMM YYYY",
      details: "Relevant coursework, awards, or certifications.",
    },
  ],
};

export function cloneStarterResume(targetRole: string): ResumeData {
  const role = targetRole.toLowerCase();
  const data = JSON.parse(JSON.stringify(starterResume)) as ResumeData;

  if (role.includes("sales") || role.includes("customer")) {
    data.summary =
      "Customer-facing operator focused on retention, renewals, stakeholder communication, and practical workflow improvements. Comfortable managing accounts, clarifying next steps, and turning customer needs into measurable business outcomes.";
    data.hardSkills = [
      "CRM",
      "Pipeline tracking",
      "Renewal forecasting",
      "Account planning",
      "Customer reporting",
    ];
    data.softSkills = [
      "Customer success",
      "Account management",
      "Renewals",
      "Upsell support",
      "Stakeholder communication",
      "Issue resolution",
    ];
    data.languages = [];
  }

  if (role.includes("product") || role.includes("ops")) {
    data.summary =
      "Product-minded operator who turns ambiguous business needs into structured processes, clear documentation, and practical tooling. Strong across workflow design, cross-functional execution, and data-informed prioritization.";
    data.hardSkills = [
      "Process mapping",
      "Data analysis",
      "Documentation",
      "Workflow automation",
      "Requirements gathering",
    ];
    data.softSkills = [
      "Product operations",
      "Process improvement",
      "Project coordination",
      "Stakeholder management",
      "Prioritization",
    ];
    data.languages = [];
  }

  if (role.includes("tech") || role.includes("ai")) {
    data.summary =
      "Hands-on AI builder with a commercial background, focused on building practical tools that improve workflows, documentation, and decision-making. Comfortable moving from user problem to prototype and iteration.";
    data.hardSkills = [
      "AI workflow design",
      "Prompting",
      "Next.js",
      "TypeScript",
      "SQLite",
      "Automation",
    ];
    data.softSkills = [
      "Product thinking",
      "Rapid prototyping",
      "Problem framing",
    ];
    data.languages = [];
  }

  return data;
}
