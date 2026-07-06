import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_payments",
  title: "List payments",
  description: "List recorded payments, optionally filtered by invoice or date range.",
  inputSchema: {
    invoice_id: z.string().uuid().optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ invoice_id, from_date, to_date, limit }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("payments")
      .select("id,invoice_id,amount,payment_date,method,reference,notes,created_at")
      .order("payment_date", { ascending: false })
      .limit(limit);
    if (invoice_id) q = q.eq("invoice_id", invoice_id);
    if (from_date) q = q.gte("payment_date", from_date);
    if (to_date) q = q.lte("payment_date", to_date);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { payments: data ?? [] },
    };
  },
});
