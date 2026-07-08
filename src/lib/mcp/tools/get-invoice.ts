import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_invoice",
  title: "Get invoice",
  description: "Fetch a single invoice with its line items and payments, by invoice id or invoice number.",
  inputSchema: {
    id: z.string().uuid().optional().describe("Invoice UUID."),
    invoice_number: z.string().optional().describe("Human invoice number, e.g. MMB-26-0001."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, invoice_number }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    if (!id && !invoice_number) {
      return { content: [{ type: "text", text: "Provide id or invoice_number." }], isError: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("invoices").select("*, invoice_items(*), payments(*)").limit(1);
    q = id ? q.eq("id", id) : q.eq("invoice_number", invoice_number!);
    const { data, error } = await q.maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Not found" }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { invoice: data },
    };
  },
});
