// lib/admin/audit.ts — append-only admin action log.
// Every admin route should call recordAdminAction after a successful
// mutation. Failures here are swallowed (and logged) so an audit-table
// outage never breaks the actual admin operation.
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export interface AdminActionInput {
  adminId:    string;
  adminEmail: string | null;
  action:     string;            // e.g. 'user.update_plan'
  targetType: string | null;     // 'user' | 'company' | 'job' | 'subscription'
  targetId:   string | null;
  metadata?:  Record<string, any>;
}

export async function recordAdminAction(input: AdminActionInput): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    await supabase.from('admin_actions').insert({
      admin_id:    input.adminId,
      admin_email: input.adminEmail,
      action:      input.action,
      target_type: input.targetType,
      target_id:   input.targetId,
      metadata:    input.metadata ?? null,
    });
  } catch (err) {
    // Audit log is best-effort. If admin_actions doesn't exist yet
    // (migration_v4 not applied) we still want the underlying admin
    // operation to succeed.
    console.error('[audit] recordAdminAction failed:', err);
  }
}
