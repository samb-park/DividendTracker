import { getSingleUserSession } from "@/lib/single-user-mode";

export async function auth() {
  return getSingleUserSession();
}
