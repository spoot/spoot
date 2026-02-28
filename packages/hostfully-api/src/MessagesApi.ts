import { z } from "zod";

import { Lead } from "./LeadsApi";
import { HostfullyApi } from "./HostfullyApi";
import { scan } from "./pagination";

const MessageSchema = z
  .object({
    createdUtcDateTime: z.string(),
    status: z.enum(["CREATED", "PENDING", "SENT", "FAILED"]),
    type: z.enum([
      "HOSTFULLY_PMP",
      "AIRBNB",
      "VRBO",
      "BOOKING_COM",
      "EMAIL",
      "SMS",
      "WHATSAPP",
    ]),
    content: z.object({
      subject: z.string().nullable(),
      text: z.string().nullable(),
    }),
    threadUid: z.string(),
  })
  .passthrough();

export class MessagesApi {
  constructor(private readonly api: HostfullyApi) {}

  async list(opts: { lead: Lead; limit?: number; cursor?: string }) {
    return await this.api.transport.fetch({
      method: "GET",
      path: `/api/v3.1/messages/${encodeURIComponent(opts.lead.uid)}`,
      query: {
        _limit: opts.limit?.toString(),
        _cursor: opts.cursor,
      },
      response: z.object({
        messages: z.array(MessageSchema),
        _metadata: z.object({
          count: z.number(),
        }),
        _paging: z.object({
          _limit: z.number(),
          _nextCursor: z.string().nullable(),
        }),
      }),
    });
  }

  async *scan(opts: { lead: Lead; perPage?: number }) {
    console.log(
      "Downloading all messages in conversation for lead",
      opts.lead.uid,
    );

    yield* scan(async (cursor) => {
      console.log("Fetching messages", cursor);
      return await this.list({ lead: opts.lead, limit: opts.perPage, cursor });
    });
  }
}
