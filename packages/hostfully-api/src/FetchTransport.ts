import { GqlQuery, printGql } from "@spoot/gql";
import { z } from "zod";
import { RateLimiting } from "./RateLimiting";
import { FetchOptions } from "./Transport";

export class FetchTransport {
  private readonly graphqlUrl: URL;
  private readonly headers: Record<string, string>;
  private readonly rateLimiting = new RateLimiting();
  private readonly apiHost: URL;
  private readonly _fetch: (
    url: URL,
    init: RequestInit,
  ) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;

  constructor(options: {
    apiHost: URL;
    apiKey: string;
    globalFetch?: FetchTransport["_fetch"];
  }) {
    this.apiHost = options.apiHost;
    this._fetch =
      options.globalFetch ??
      (async (url: URL, init: RequestInit) => {
        return await global.fetch(url, init).then(async (resp) => {
          const headers: Record<string, string> = {};

          resp.headers.forEach((v, k) => {
            headers[`${k}`.toLocaleLowerCase()] = `${v}`;
          });

          return {
            ok: resp.ok,
            status: resp.status,
            statusText: resp.statusText,
            headers,
            async json() {
              return await resp.json();
            },
            async text() {
              return await resp.text();
            },
          };
        });
      });
    this.graphqlUrl = new URL("/api/v3/graphql", options.apiHost);
    this.headers = {
      "X-HOSTFULLY-APIKEY": options.apiKey,
      "content-type": "application/json",
    };
  }

  async fetchGql<Response>(query: GqlQuery, schema: z.Schema<Response>) {
    await this.rateLimiting.take();

    const reqBody = JSON.stringify(
      {
        query: printGql(query),
      },
      null,
      2,
    );

    const resp = await this._fetch(this.graphqlUrl, {
      method: "POST",
      headers: this.headers,
      body: reqBody,
    });
    this.rateLimiting.onResponse(resp.headers);

    if (!resp.ok) {
      throw new Error(
        `GraphQL query failed: ${reqBody}\n-- Response --\n ${resp.status} ${resp.statusText}: ${await resp.text()}`,
      );
    }

    const respBody = z
      .object({
        errors: z.unknown().optional(),
        data: z.unknown().optional(),
      })
      .parse(await resp.json());

    if (respBody.errors) {
      const errs = JSON.stringify(respBody.errors, null, 2);
      throw new Error(
        `GraphQL query failed: ${reqBody}\n-- Errors --\n ${errs}`,
      );
    }

    return schema.parse(respBody.data);
  }

  async fetch<Response>(options: FetchOptions<Response>): Promise<Response> {
    await this.rateLimiting.take();

    const url = new URL(options.path, this.apiHost);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value != null) {
          url.searchParams.set(key, value);
        }
      }
    }

    const resp = await this._fetch(url, {
      method: options.method,
      headers: this.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    this.rateLimiting.onResponse(resp.headers);

    if (!resp.ok) {
      throw new Error(
        `Failed to fetch ${options.path}: ${resp.statusText}: ${await resp.text()}`,
      );
    }

    if (!options.response) {
      return {} as Response;
    }

    const parsed = options.response.safeParse(await resp.json());
    if (parsed.success) {
      return parsed.data;
    }

    throw new Error(
      `Failed to ${options.method} ${options.path}: ${JSON.stringify(parsed.error, null, 2)}`,
    );
  }
}
