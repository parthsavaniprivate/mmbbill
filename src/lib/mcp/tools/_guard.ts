import type { ToolContext, ToolHandlerResult } from "@lovable.dev/mcp-js";

/**
 * Verify caller is authenticated AND has the 'admin' role.
 * Returns an error result to short-circuit, or null when authorized.
 */
export async function requireAdmin(ctx: ToolContext): Promise<ToolHandlerResult | null> {
  if (!ctx.isAuthenticated()) {
    return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
  }
  const userId = ctx.getUserId?.();
  if (!userId) {
    return { content: [{ type: "text", text: "Forbidden" }], isError: true };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) {
    return { content: [{ type: "text", text: "Forbidden: admin role required" }], isError: true };
  }
  return null;
}
