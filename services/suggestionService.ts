// services/suggestionService.ts
import { supabase } from "../supabase";

export type SuggestionType = "bug" | "feature" | "general";

export interface AddSuggestionInput {
  type: SuggestionType;
  content: string;
}

export async function addSuggestion({ type, content }: AddSuggestionInput): Promise<void> {
  const trimmed = (content ?? "").trim();
  if (!trimmed) {
    throw new Error("Suggestion content is empty.");
  }

  // Generate a stable text PK (matches your schema: id text primary key)
  const id = `suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // Get authenticated user info (ok if null)
  const userRes = await supabase.auth.getUser();
  const user = userRes?.data?.user ?? null;

  // Matches your table schema:
  // (id, type, content, timestamp, status, user_id, user_email)
  const payload = {
    id,
    type,
    content: trimmed,
    timestamp: Date.now(), // bigint NOT NULL in your schema
    status: "new",
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
  };

  const { error } = await supabase.from("app_suggestions").insert(payload);

  // IMPORTANT: Throw on error so the UI can stop "sending..." and show feedback
  if (error) {
    console.error("Supabase insert failed: app_suggestions", error);
    throw error;
  }
}
