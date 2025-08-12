import { NextResponse } from "next/server";

const BASE = "https://api.company-information.service.gov.uk/search/companies";

function brandabilityScore(name) {
  if (!name) return 0;
  const clean = name.replace(/[^a-z0-9]/gi, "");
  let score = 0;
  if (clean.length <= 12) score += 10;
  if (!/[-_0-9]/.test(name)) score += 10;
  if (clean.length > 18) score -= 5;
  return Math.max(0, Math.min(20, score));
}

function computeNoweScore(item) {
  let score = 50;
  const created = item.date_of_creation ? new Date(item.date_of_creation) : null;
  if (created) {
    const days = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 7) score += 20;
    else if (days <= 30) score += 10;
    else if (days <= 90) score += 5;
  }
  score += brandabilityScore(item.company_name);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("query") || "").trim();
    const returnAll = searchParams.get("all") === "true";
    if (!q) return NextResponse.json([], { status: 200 });

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) return NextResponse.json([], { status: 200 });

    const auth = Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch(`${BASE}?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });

    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];

    let results = items.map((c) => ({
      company_name: c?.title ?? "",
      company_number: c?.company_number ?? "",
      date_of_creation: c?.date_of_creation ?? "",
      company_status: c?.company_status ?? "",
      address_snippet: c?.address_snippet ?? "",
    })).map((r) => ({ ...r, nowe_score: computeNoweScore(r) }));

    if (!returnAll) results = results.filter((r) => r.nowe_score >= 80);
    return NextResponse.json(results, { status: 200 });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
