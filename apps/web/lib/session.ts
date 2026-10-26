import { getAuth } from "@ability/api";
import { headers } from "next/headers";

export async function getSession() {
  return getAuth().api.getSession({ headers: await headers() });
}
