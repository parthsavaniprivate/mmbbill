import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAdmin } from "./_guard";

export default defineTool({
  name: "revenue_summary",
  title: "Revenue summary",
  description: "Aggregate totals: invoiced, collected, pending — optionally for a date range or company.",
  inputSchema: {
    company_id: z.string().uuid().optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id, from_date, to_date }, ctx: ToolContext) => {
    const denied = await requireAdmin(ctx);
    if (denied) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("invoices").select("total,amount_paid,status,company_id,invoice_date");
    if (company_id) q = q.eq("company_id", company_id);
    if (from_date) q = q.gte("invoice_date", from_date);
    if (to_date) q = q.lte("invoice_date", to_date);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const invoiced = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    const collected = rows.reduce((s, r) => s + Number(r.amount_paid ?? 0), 0);
    const pending = invoiced - collected;
    const summary = { invoice_count: rows.length, invoiced, collected, pending };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
