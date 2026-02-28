import { GqlQuery } from "@spoot/gql";
import { z } from "zod";

export interface FetchOptions<Response> {
  path: string;
  query?: Record<string, string | undefined | null>;
  method: string;
  body?: object;
  response: z.Schema<Response> | null;
}

export interface Transport {
  fetchGql<Response>(
    query: GqlQuery,
    schema: z.Schema<Response>,
  ): Promise<Response>;
  fetch<Response>(options: FetchOptions<Response>): Promise<Response>;
}
