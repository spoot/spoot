import { z } from "zod";
import { HostfullyApi } from "./HostfullyApi";
import { Property } from "./PropertiesApi";
import {
  AirbnbFeeTypeSchema,
  BookingDotComFeeTypeSchema,
  MarriottFeeTypeSchema,
  VrboFeeTypeSchema,
} from "./enums";

const PropertyFeeSchema = z.object({
  uid: z.string().uuid(),
  propertyUid: z.string().uuid(),
  amount: z.number(),
  amountType: z.enum(["TAX", "AMOUNT"]),
  name: z.string(),
  optional: z.boolean(),
  scope: z.enum(["PER_STAY", "PER_GUEST", "PER_NIGHT", "PER_GUEST_PER_NIGHT"]),
  taxationRate: z.number(),
  type: z.enum([
    "CLEANING",
    "EARLY_ARRIVAL",
    "LATE_ARRIVAL",
    "PET",
    "TAX",
    "CUSTOM",
  ]),
  airbnbType: AirbnbFeeTypeSchema.nullable(),
  bookingDotComType: BookingDotComFeeTypeSchema.nullable(),
  hostfullyType: z.literal("DEFAULT").nullable(),
  hvmiType: MarriottFeeTypeSchema.nullable(),
  vrboType: VrboFeeTypeSchema.nullable(),
});

const GetPropertyFeeRepsonseSchema = z.object({
  fees: z.array(PropertyFeeSchema),
  _metadata: z.object({
    count: z.number(),
  }),
});

export type PropertyFee = z.infer<typeof PropertyFeeSchema>;
export type PropertyTaxFeeInput = Omit<PropertyFee, "uid" | "propertyUid">;

export class FeesApi {
  constructor(private readonly api: HostfullyApi) {}

  async list(property: Property): Promise<PropertyFee[]> {
    const resp = await this.api.transport.fetch({
      method: "GET",
      path: "/api/v3.1/fees",
      query: { propertyUid: property.uid },
      response: GetPropertyFeeRepsonseSchema,
    });

    if (resp._metadata.count > resp.fees.length) {
      throw new Error(
        `Expected API to return ${resp._metadata.count} fees, got ${resp.fees.length}`,
      );
    }

    return resp.fees;
  }

  async create(property: Property, fields: PropertyTaxFeeInput) {
    const body = {
      propertyUid: property.uid,
      amount: fields.amount,
      amountType: fields.amountType,
      name: fields.name,
      optional: fields.optional,
      scope: fields.scope,
      taxationRate: fields.taxationRate,
      type: fields.type,

      // OTS stuff
      airbnbType: fields.airbnbType ?? null,
      bookingDotComType: fields.bookingDotComType ?? null,
      hostfullyType: fields.hostfullyType ?? null,
      hvmiType: fields.hvmiType ?? null,
      vrboType: "TAX",

      // required, even though it's not used
      attestation: false,
      longTermStayExemption: 30,
    };

    await this.api.transport.fetch({
      method: "POST",
      path: "/api/v3.1/fees",
      body: body,
      response: null,
    });
  }

  async delete(uid: string) {
    await this.api.transport.fetch({
      path: `/api/v3.1/fees/${uid}`,
      method: "DELETE",
      response: null,
    });
  }
}
