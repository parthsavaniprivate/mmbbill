import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list-clients";
import listInvoices from "./tools/list-invoices";
import getInvoice from "./tools/get-invoice";
import listPayments from "./tools/list-payments";
import revenueSummary from "./tools/revenue-summary";

// The OAuth issuer MUST be the direct Supabase host (not the .lovable.cloud proxy).
// VITE_SUPABASE_PROJECT_ID is inlined at build time by Vite.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "agency-os-mcp",
  title: "Agency OS — MMB & JPS",
  version: "0.1.0",
  instructions:
    "Tools for the Agency OS billing/CRM. Read clients, invoices (with items and payments), payments, and revenue summaries across Make Me Brand and Janki Parth Savani companies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClients, listInvoices, getInvoice, listPayments, revenueSummary],
});
