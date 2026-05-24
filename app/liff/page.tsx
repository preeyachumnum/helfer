import { redirect } from "next/navigation";

const allowedPages = new Set(["manual", "upload", "health"]);

export default async function LiffPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const state = Array.isArray(params["liff.state"]) ? params["liff.state"][0] : params["liff.state"];
  
  // Clean the state path (remove leading slash)
  const cleanState = state?.replace(/^\//, "");
  const parts = cleanState?.split(/[/?#]/) ?? [];
  
  // Handle case where state contains the full '/liff/page' path
  let page = parts[0];
  if (page === "liff" && parts.length > 1) {
    page = parts[1];
  }

  // Build query string to preserve LINE Login/OAuth parameters (code, state, etc.)
  const searchString = new URLSearchParams(
    Object.entries(params).reduce((acc, [key, val]) => {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach((v) => acc.append(key, v));
        } else {
          acc.append(key, val);
        }
      }
      return acc;
    }, new URLSearchParams())
  ).toString();

  const queryString = searchString ? `?${searchString}` : "";

  if (page && allowedPages.has(page)) {
    redirect(`/liff/${page}${queryString}`);
  }

  redirect(`/liff/manual${queryString}`);
}
