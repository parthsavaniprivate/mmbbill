import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_invoices",
  title: "List invoices",
  description: "List invoices with optional filters for status, client, or date range.",
  inputSchema: {
    status: z.enum(["draft", "pending", "paid", "partially_paid", "overdue", "cancelled"]).optional(),
    client_id: z.string().uuid().optional(),
    from_date: z.string().optional().describe("ISO date (YYYY-MM-DD) — include invoices on/after this date."),
    to_date: z.string().optional().describe("ISO date (YYYY-MM-DD) — include invoices on/before this date."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, client_id, from_date, to_date, limit }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("invoices")
      .select("id,invoice_number,client_name,client_id,invoice_date,due_date,total,amount_paid,status,company_id")
      .order("invoice_date", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (client_id) q = q.eq("client_id", client_id);
    if (from_date) q = q.gte("invoice_date", from_date);
    if (to_date) q = q.lte("invoice_date", to_date);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { invoices: data ?? [] },
    };
  },
});
