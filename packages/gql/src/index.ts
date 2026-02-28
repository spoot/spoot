import { DocumentNode, print } from "graphql";
import { z } from "zod";
export { gql } from "graphql-tag";

export { type DocumentNode as GqlQuery, print as printGql };

export async function fetchGql<S extends z.Schema>(
  url: URL,
  headers: Record<string, string>,
  query: DocumentNode,
  schema: S,
): Promise<z.infer<S>> {
  const reqBody = JSON.stringify(
    {
      query: print(query),
    },
    null,
    2,
  );

  const resp = await fetch(url, {
    method: "POST",
    headers: headers,
    body: reqBody,
  });

  if (!resp.ok) {
    throw new Error(
      `GraphQL query failed: ${reqBody}\n-- Response --\n ${resp.status} ${resp.statusText}: ${await resp.text()}`,
    );
  }

  const respBody = await resp.json();
  if (respBody.errors) {
    const errs = JSON.stringify(respBody.errors, null, 2);
    throw new Error(`GraphQL query failed: ${reqBody}\n-- Errors --\n ${errs}`);
  }

  return schema.parse(respBody.data);
}
