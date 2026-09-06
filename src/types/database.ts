/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Placeholder Database type.
 *
 * Replace with generated types once the Supabase project is linked:
 *   npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.ts
 *
 * Until then rows come back loosely typed; `src/types/domain.ts` holds the
 * hand-maintained domain types that component props are built from, and query
 * results are narrowed with explicit casts at the call site.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LooseTable = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, { Row: Record<string, any>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, any>; Returns: any }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, any>>;
  };
};
