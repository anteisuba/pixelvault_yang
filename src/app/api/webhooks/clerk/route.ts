import { headers } from "next/headers";
import { Webhook } from "svix";
import { createUser } from "@/services/user.service";

// ─── Clerk event types ────────────────────────────────────────────

interface ClerkEmailAddress {
  email_address: string;
}

interface ClerkUserCreatedData {
  id: string;
  email_addresses: ClerkEmailAddress[];
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserCreatedData;
}

// ─── POST /api/webhooks/clerk ─────────────────────────────────────

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  // 1. Read svix headers for signature verification
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // 2. Verify webhook signature
  const body = await request.text();
  const wh = new Webhook(secret);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // 3. Handle user.created
  if (event.type === "user.created") {
    const { id, email_addresses } = event.data;
    const email = email_addresses[0]?.email_address;

    if (!email) {
      return new Response("No email address on user", { status: 400 });
    }

    await createUser({ clerkId: id, email });
  }

  return new Response(null, { status: 200 });
}
