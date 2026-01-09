import { supabase } from "../supabase";

export type SuggestionStatus = "new" | "reviewing" | "resolved" | "archived";

export interface AppSuggestionRow {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  status: SuggestionStatus | null;
  user_id: string | null;
  user_email: string | null;
}

export async function fetchSuggestions(params?: {
  status?: SuggestionStatus | "all";
  limit?: number;
}): Promise<AppSuggestionRow[]> {
  const status = params?.status ?? "all";
  const limit = params?.limit ?? 100;

  let q = supabase
    .from("app_suggestions")
    .select("id,type,content,timestamp,status,user_id,user_email")
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []) as AppSuggestionRow[];
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus) {
  const { error } = await supabase
    .from("app_suggestions")
    .update({ status })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteSuggestion(id: string) {
  const { error } = await supabase
    .from("app_suggestions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}