import { redirect } from "next/navigation";

/**
 * Root page — redirects to the studio page.
 * In Phase 3 this will redirect to the default locale.
 */
export default function RootPage() {
  redirect("/en/sign-in");
}
