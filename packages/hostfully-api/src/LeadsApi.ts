import { z } from "zod";
import { Rx } from "@spoot/rx";
import { Day } from "@spoot/day";
import { HostfullyApi } from "./HostfullyApi";
import { PagingSchema, scan } from "./pagination";
import { Property } from "./PropertiesApi";
import { LeadStatusSchema } from "./enums";

export const LeadSchema = z.object({
  uid: z.string(),
  type: z.enum(["INQUIRY", "BOOKING_REQUEST", "BLOCK", "BOOKING"]).nullable(),
  status: LeadStatusSchema.nullable(),
  source: z.enum([
    "HOSTFULLY_UI",
    "HOSTFULLY_DBS",
    "HOSTFULLY_API",
    "HOSTFULLY_LINKED",
    "HOSTFULLY_OWNER_PORTAL",
    "HOSTFULLY_ICAL",
    "DIRECT_HOMETOGO",
    "DIRECT_BOOKINGDOTCOM",
    "DIRECT_AIRBNB",
    "DIRECT_VRBO",
    "DIRECT_HVMI",
    "DIRECT_REDAWNING",
    "DIRECT_GOOGLE",
  ]),
  propertyUid: z.string().nullable(),
  agencyUid: z.string().nullable(),
  checkInZonedDateTime: z.string(),
  checkOutZonedDateTime: z.string(),
  checkInLocalDateTime: z.string(),
  checkOutLocalDateTime: z.string(),
  bookedUtcDateTime: z.string().nullable(),
  externalBookingId: z.string().nullable(),
  notes: z.string().nullable(),
  extraNotes: z.string().nullable(),
  referrer: z.string().nullable(),

  assignee: z
    .object({
      uid: z.string().nullable(),
      type: z.string().nullable(),
    })
    .nullable(),

  metadata: z.object({
    createdUtcDateTime: z.string().nullable(),
    updatedUtcDateTime: z.string().nullable(),
    creationCircumstances: z.string().nullable(),
  }),

  guestInformation: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    address1: z.string().nullable(),
    address2: z.string().nullable(),
    zipCode: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    countryCode: z.string().nullable(),
    passportId: z.string().nullable(),
    passportCountryCode: z.string().nullable(),
    adultCount: z.number().nullable(),
    childrenCount: z.number().nullable(),
    petCount: z.number().nullable(),
    infantCount: z.number().nullable(),
    riskScore: z.number().nullable(),
    email: z.string().nullable(),
    secondaryEmail: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    cellPhoneNumber: z.string().nullable(),
    flightNumber: z.string().nullable(),
    reasonForTrip: z.string().nullable(),
    willHaveParty: z.boolean().nullable(),
    willHaveVisit: z.boolean().nullable(),
    preferredCurrency: z.string().nullable(),
    preferredLocale: z.unknown().nullable(),
    arrivalLocalDateTime: z.string().nullable(),
    departureLocalDateTime: z.string().nullable(),
  }),
});

export type Lead = z.infer<typeof LeadSchema>;
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
type LeadSource = { property: Property } | { propertyUid: string };

export class LeadsApi {
  constructor(private readonly api: HostfullyApi) {}

  async get(uid: string) {
    return (
      await this.api.transport.fetch({
        method: "GET",
        path: `/api/v3.1/leads/${encodeURIComponent(uid)}`,
        response: z.object({ lead: LeadSchema }),
      })
    ).lead;
  }

  async list(
    opts: {
      source?: LeadSource;
      checkInFrom?: Day;
      checkInTo?: Day;
      checkOutFrom?: Day;
      checkOutTo?: Day;
      updatedSince?: Day;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    return await this.api.transport.fetch({
      method: "GET",
      path: "/api/v3.1/leads",
      query: {
        ...(!opts.source
          ? { agencyUid: this.api.agencyUid }
          : "property" in opts.source
            ? { propertyUid: opts.source.property.uid }
            : { propertyUid: opts.source.propertyUid }),
        checkInFrom: opts.checkInFrom ? opts.checkInFrom.toJSON() : undefined,
        checkInTo: opts.checkInTo ? opts.checkInTo.toJSON() : undefined,
        checkOutFrom: opts.checkOutFrom
          ? opts.checkOutFrom.toJSON()
          : undefined,
        checkOutTo: opts.checkOutTo ? opts.checkOutTo.toJSON() : undefined,
        updatedSince: opts.updatedSince
          ? opts.updatedSince.toJSON()
          : undefined,
        _limit: opts.limit?.toString(),
        _cursor: opts.cursor,
      },
      response: z.object({
        leads: z.array(LeadSchema),
        _metadata: z.object({
          count: z.number(),
        }),
        _paging: PagingSchema,
      }),
    });
  }

  async *scan(
    opts: {
      source?: LeadSource;
      checkInFrom?: Day;
      checkInTo?: Day;
      checkOutFrom?: Day;
      checkOutTo?: Day;
      updatedSince?: Day;
      perPage?: number;
    } = {},
  ) {
    const { perPage, ...rest } = opts;
    yield* scan(async (cursor) => {
      return await this.list({ ...rest, limit: perPage, cursor });
    });
  }

  async all(
    opts: {
      source?: LeadSource;
      checkInFrom?: Day;
      checkInTo?: Day;
      checkOutFrom?: Day;
      checkOutTo?: Day;
      updatedSince?: Day;
      perPage?: number;
    } = {},
  ) {
    return await Rx.lastValueFrom(
      Rx.from(this.scan(opts)).pipe(
        Rx.mergeMap(({ leads }) => leads),
        Rx.toArray(),
      ),
    );
  }
}
