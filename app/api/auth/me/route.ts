import { NextResponse } from "next/server";

import { currentStaff } from "@/lib/auth/staff";

export async function GET() {
  return NextResponse.json({ staff: await currentStaff() });
}
