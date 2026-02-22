import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserCredits } from "@/services/user.service";

export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credits = await getUserCredits(clerkId);

  return NextResponse.json({ credits });
}
