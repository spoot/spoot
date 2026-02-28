import { z } from "zod";
import { HostfullyApi } from "./HostfullyApi";

const AgencySchema = z.object({
  uid: z.string(),
  name: z.string(),
  agencyEmailAddress: z.string(),
  phoneNumber: z.string(),
  website: z.string(),
  address1: z.string(),
  city: z.string(),
  zipCode: z.string(),
  state: z.string(),
  currency: z.string(),
  currencyCode: z.string(),
  countryCode: z.string(),
  defaultCheckInTime: z.number(),
  defaultCheckOutTime: z.number(),
  rentalCondition: z.string().nullable(),
});

export type Agency = z.infer<typeof AgencySchema>;

export class AgenciesApi {
  constructor(private readonly api: HostfullyApi) {}

  async get() {
    return (
      await this.api.transport.fetch({
        path: `/api/v3.1/agencies/${this.api.agencyUid}`,
        method: "GET",
        response: z.object({
          agency: z.array(AgencySchema),
        }),
      })
    ).agency;
  }
}
