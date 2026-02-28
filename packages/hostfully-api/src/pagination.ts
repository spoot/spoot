import { z } from "zod";

export const PagingSchema = z.object({
  _limit: z.number(),
  _nextCursor: z.string().nullable(),
});

export type Paging = z.infer<typeof PagingSchema>;

export async function* scan<Result extends { _paging: Paging }>(
  fn: (cursor: string | undefined) => Promise<Result>,
) {
  let cursor: string | undefined | null = undefined;
  let done = false;

  while (!done) {
    const result = await fn(cursor ?? undefined);
    yield result;
    cursor = result._paging._nextCursor;
    done = cursor == null;
  }
}
