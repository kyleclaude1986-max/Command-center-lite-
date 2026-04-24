import { createHmac, randomBytes } from "node:crypto";
import { env, requireEnv } from "../env";
import { db } from "../db/client";
import { netsuiteMetrics } from "../db/schema";

// --- OAuth 1.0a signing (HMAC-SHA256, NetSuite TBA) ---

function percentEncode(v: string): string {
  return encodeURIComponent(v).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function signRequest(method: string, url: string, params: Record<string, string>): string {
  const consumerSecret = requireEnv("NETSUITE_CONSUMER_SECRET");
  const tokenSecret = requireEnv("NETSUITE_TOKEN_SECRET");
  const realm = requireEnv("NETSUITE_ACCOUNT_ID");

  const oauth: Record<string, string> = {
    oauth_consumer_key: requireEnv("NETSUITE_CONSUMER_KEY"),
    oauth_token: requireEnv("NETSUITE_TOKEN_KEY"),
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_signature_method: "HMAC-SHA256",
    oauth_version: "1.0",
  };

  const allParams = { ...params, ...oauth };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const base = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = createHmac("sha256", signingKey).update(base).digest("base64");

  const headerParams = { ...oauth, oauth_signature: signature, realm };
  return (
    "OAuth " +
    Object.entries(headerParams)
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(", ")
  );
}

function baseUrl(): string {
  const acct = requireEnv("NETSUITE_ACCOUNT_ID").toLowerCase().replace(/_/g, "-");
  return `https://${acct}.suitetalk.api.netsuite.com`;
}

// --- SuiteQL ---

export async function suiteql<T = Record<string, unknown>>(q: string): Promise<T[]> {
  const url = `${baseUrl()}/services/rest/query/v1/suiteql`;
  const auth = signRequest("POST", url, {});
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Prefer: "transient",
    },
    body: JSON.stringify({ q }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`NetSuite SuiteQL ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as { items?: T[] };
  return json.items ?? [];
}

// --- Metric queries ---

function scopeClause(alias = "t"): string {
  const parts: string[] = [];
  if (env.NETSUITE_SUBSIDIARY_ID) parts.push(`${alias}.subsidiary = ${Number(env.NETSUITE_SUBSIDIARY_ID)}`);
  if (env.NETSUITE_DEPARTMENT_ID) parts.push(`${alias}.department = ${Number(env.NETSUITE_DEPARTMENT_ID)}`);
  return parts.length ? " AND " + parts.join(" AND ") : "";
}

async function sumTransactions(where: string): Promise<number> {
  const q = `
    SELECT NVL(SUM(tl.netamount), 0) AS total
    FROM transaction t
    JOIN transactionline tl ON tl.transaction = t.id
    WHERE tl.mainline = 'F'
      AND ${where}
      ${scopeClause("t")}
  `.trim();
  const rows = await suiteql<{ total: string | number }>(q);
  return Number(rows[0]?.total ?? 0);
}

export async function getYtdGross(now = new Date()): Promise<number> {
  const year = now.getUTCFullYear();
  const where = `t.type IN ('CustInvc','CashSale') AND t.posting = 'T'
    AND t.trandate >= TO_DATE('${year}-01-01','YYYY-MM-DD')
    AND t.trandate <= SYSDATE`;
  const invoices = await sumTransactions(where);
  const creditWhere = `t.type = 'CustCred' AND t.posting = 'T'
    AND t.trandate >= TO_DATE('${year}-01-01','YYYY-MM-DD')
    AND t.trandate <= SYSDATE`;
  const credits = await sumTransactions(creditWhere);
  return invoices - credits;
}

export async function getMtdGross(now = new Date()): Promise<number> {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const where = `t.type IN ('CustInvc','CashSale') AND t.posting = 'T'
    AND t.trandate >= TO_DATE('${y}-${m}-01','YYYY-MM-DD')
    AND t.trandate <= SYSDATE`;
  const invoices = await sumTransactions(where);
  const creditWhere = `t.type = 'CustCred' AND t.posting = 'T'
    AND t.trandate >= TO_DATE('${y}-${m}-01','YYYY-MM-DD')
    AND t.trandate <= SYSDATE`;
  const credits = await sumTransactions(creditWhere);
  return invoices - credits;
}

// Pipeline = open estimates (status != Closed / Processed). Expired is included.
// NetSuite estimate statuses include: Open (A), Processed (B), Closed (C), Voided (V), Expired (X).
// "Processed" means the quote has been turned into a sales order. "Closed" means manually closed.
export async function getPipeline(): Promise<number> {
  const q = `
    SELECT NVL(SUM(tl.netamount), 0) AS total
    FROM transaction t
    JOIN transactionline tl ON tl.transaction = t.id
    WHERE t.type = 'Estimate'
      AND tl.mainline = 'F'
      AND t.status NOT IN ('EstimateClosed', 'EstimateProcessed', 'EstimateVoided')
      ${scopeClause("t")}
  `.trim();
  const rows = await suiteql<{ total: string | number }>(q);
  return Number(rows[0]?.total ?? 0);
}

// --- Sync driver ---

export async function syncNetsuite(): Promise<{ ytd: number; mtd: number; pipeline: number }> {
  const [ytd, mtd, pipeline] = await Promise.all([getYtdGross(), getMtdGross(), getPipeline()]);
  const now = Math.floor(Date.now() / 1000);
  const rows = [
    { metricKey: "ytd_gross", value: String(ytd), asOf: now },
    { metricKey: "mtd_gross", value: String(mtd), asOf: now },
    { metricKey: "pipeline", value: String(pipeline), asOf: now },
  ];
  for (const r of rows) {
    db.insert(netsuiteMetrics)
      .values(r)
      .onConflictDoUpdate({
        target: netsuiteMetrics.metricKey,
        set: { value: r.value, asOf: r.asOf },
      })
      .run();
  }
  return { ytd, mtd, pipeline };
}
