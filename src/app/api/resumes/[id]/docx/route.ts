import { NextResponse } from "next/server";

import { getVersion } from "@/lib/db";
import { buildDocx } from "@/lib/docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function filename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "resume";
}

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const version = getVersion(Number(id));
  if (!version) return NextResponse.json({ error: "Resume version not found" }, { status: 404 });

  const docx = buildDocx(version.data);
  return new NextResponse(Buffer.from(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename(version.name)}.docx"`,
    },
  });
}
