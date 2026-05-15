export type ContactInfo = {
  fullName: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  links: string;
};

export type ResumeItem = {
  id: string;
  organization: string;
  role: string;
  location: string;
  start: string;
  end: string;
  keywords: string;
  impact: string;
  originalDescription: string;
  bullets: string[];
};

export type EducationItem = {
  id: string;
  school: string;
  degree: string;
  location: string;
  start: string;
  end: string;
  details: string;
};

export type ResumeData = {
  contact: ContactInfo;
  summary: string;
  hardSkills: string[];
  softSkills: string[];
  skills?: string[];
  experience: ResumeItem[];
  projects: ResumeItem[];
  education: EducationItem[];
};

export type ResumeVersion = {
  id: number;
  profileId: number;
  profileName: string;
  targetRole: string;
  applicationCompany?: string;
  name: string;
  data: ResumeData;
  createdAt: string;
  updatedAt: string;
};

export type ResumeListItem = Omit<ResumeVersion, "data"> & {
  previewName: string;
};
