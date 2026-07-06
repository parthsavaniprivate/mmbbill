import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description: "List clients in the agency CRM, optionally filtered by a name/email/phone search term.",
  inputSchema: {
    search: z.string().optional().describe("Optional case-insensitive substring to match against name, email, or phone."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return (1-200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("clients").select("id,name,email,phone,company_id,created_at").order("name").limit(limit);
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { clients: data ?? [] },
    };
  },
});
