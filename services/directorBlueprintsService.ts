import { supabase } from '../supabase';
import type { DirectorModeBlueprint } from '../types';

type DirectorBlueprintRow = {
  id?: string;
  user_id: string;
  inputs: any;
  blueprint_json: any;
  created_at?: string;
};

const getUserIdOrThrow = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
};

export async function saveDirectorBlueprint(inputs: any, blueprint: DirectorModeBlueprint): Promise<{ id?: string } | null> {
  try {
    const userId = await getUserIdOrThrow();
    const row: DirectorBlueprintRow = {
      user_id: userId,
      inputs,
      blueprint_json: blueprint,
    };

    const { data, error } = await supabase
      .from('maw_director_blueprints')
      .insert(row)
      .select('id')
      .single();

    if (error) throw error;
    return data as any;
  } catch (err) {
    // Non-fatal: table may not exist yet in some environments.
    console.warn('saveDirectorBlueprint failed (non-fatal):', err);
    return null;
  }
}
