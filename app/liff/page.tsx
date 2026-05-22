import { redirect } from "next/navigation";

const allowedPages = new Set(["manual", "upload", "health"]);

export default async function LiffPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const state = Array.isArray(params["liff.state"]) ? params["liff.state"][0] : params["liff.state"];
  const page = state?.replace(/^\//, "").split(/[/?#]/)[0];

  if (page && allowedPages.has(page)) {
    redirect(`/liff/${page}`);
  }

  redirect("/liff/manual");
}
