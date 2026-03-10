import { useState, useCallback } from "react";

type AsyncFn<TArgs extends any[], TResult> = (...args: TArgs) => Promise<TResult>;

/**
 * Small helper hook to wrap async actions (API calls) with loading + error state.
 *
 * Usage:
 * const { run, loading, error } = useApiAction(async (id: string) => {
 *   const { data, error } = await supabase.from("foo").select("*").eq("id", id).single();
 *   if (error) throw error;
 *   return data;
 * });
 *
 * run("123").catch(handleError);
 */
export function useApiAction<TArgs extends any[], TResult = void>(
  fn: AsyncFn<TArgs, TResult>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn(...args);
        return result;
      } catch (e: any) {
        const err = e instanceof Error ? e : new Error(e?.message ?? "Unknown error");
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fn]
  );

  return { run, loading, error };
}

