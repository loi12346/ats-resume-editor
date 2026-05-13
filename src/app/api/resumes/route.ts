import { NextResponse } from "next/server";

import { createVersion, listVersions } from "@/lib/db";
import type { ResumeData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ versions: listVersions() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    profileName?: string;
    targetRole?: string;
    name?: string;
    data?: ResumeData;
  };

  const version = createVersion({
    profileName: body.profileName || "General",
    targetRole: body.targetRole || body.profileName || "General",
    name: body.name || "Untitled Version",
    data: body.data,
  });

  return NextResponse.json({ version }, { status: 201 });
}
