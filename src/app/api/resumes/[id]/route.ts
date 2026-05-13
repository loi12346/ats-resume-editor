import { NextResponse } from "next/server";

import { deleteVersion, getVersion, updateVersion } from "@/lib/db";
import type { ResumeData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const version = getVersion(Number(id));
  if (!version) return NextResponse.json({ error: "Resume version not found" }, { status: 404 });
  return NextResponse.json({ version });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    profileName?: string;
    targetRole?: string;
    name?: string;
    data?: ResumeData;
  };

  if (!body.data) {
    return NextResponse.json({ error: "Missing resume data" }, { status: 400 });
  }

  const version = updateVersion(Number(id), {
    profileName: body.profileName || "General",
    targetRole: body.targetRole || body.profileName || "General",
    name: body.name || "Untitled Version",
    data: body.data,
  });

  if (!version) return NextResponse.json({ error: "Resume version not found" }, { status: 404 });
  return NextResponse.json({ version });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const deleted = deleteVersion(Number(id));
  return NextResponse.json({ deleted });
}
