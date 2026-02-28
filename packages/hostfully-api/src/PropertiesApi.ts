import { z } from "zod";
import { Rx } from "@spoot/rx";
import { HostfullyApi } from "./HostfullyApi";
import { PagingSchema, scan } from "./pagination";

const PropertySchema = z.object({
  name: z.string(),
  isActive: z.boolean(),
  uid: z.string().uuid(),
  showPropertyExactLocation: z.boolean(),
  cancellationPolicy: z.string().nullable(),
  availability: z.object({
    allowBookingRequestsAboveMaximumStay: z.boolean().nullable(),
    allowBookingRequestWhenOutOfLeadTime: z.boolean().nullable(),
    baseGuests: z.number(),
    bookingLeadTime: z.number().nullable(),
    bookingWindow: z.number().nullable(),
    checkInTimeEnd: z.number().nullable(),
    checkInTimeEndFlexible: z.boolean().nullable(),
    checkInTimeStart: z.number().nullable(),
    checkOutTime: z.number().nullable(),
    daysOfTheWeekToCheckInOn: z.array(z.string()),
    maxGuests: z.number(),
    maximumStay: z.number().nullable(),
    minimumStay: z.number().nullable(),
    minimumWeekendStay: z.number().nullable(),
    turnOverDays: z.number().nullable(),
  }),
  address: z.object({
    address: z.string().nullable(),
    address2: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    zipCode: z.string().nullable(),
  }),
  pricing: z.object({
    taxRate: z.number().nullable(),
    ignoreTaxRateChargeOverXDays: z.boolean().nullable(),
    daysOverWhichTaxRateChargeShouldBeIgnored: z.number().nullable(),
    cleaningFeeTaxRate: z.number().nullable(),
    extraGuestFee: z.number(),
  }),
});

export type BookingLeadTime =
  | "-15"
  | "-14"
  | "-13"
  | "-12"
  | "-11"
  | "-10"
  | "-9"
  | "-8"
  | "-7"
  | "-6"
  | "-5"
  | "-4"
  | "-3"
  | "-2"
  | "-1"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "19"
  | "20"
  | "21"
  | "22"
  | "23"
  | "24"
  | "48"
  | "72"
  | "168";

export type Property = z.infer<typeof PropertySchema>;

export interface PropertyPropertiesPatch {
  name?: string;
  showPropertyExactLocation?: boolean;
  cancellationPolicy?: string;
  pricing?: {
    taxRate?: number | null;
    ignoreTaxRateChargeOverXDays?: boolean | null;
    daysOverWhichTaxRateChargeShouldBeIgnored?: number | null;
    cleaningFeeTaxRate?: number | null;
    extraGuestFee?: number | null;
  };
  availability?: {
    baseGuests?: number;
    maxGuests?: number;
    bookingLeadTime?: BookingLeadTime;
  };
}

const PropertyDescriptionsSchema = z.object({
  name: z.string().nullable(),
  shortSummary: z.string().nullable(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  access: z.string().nullable(),
  transit: z.string().nullable(),
  interaction: z.string().nullable(),
  neighbourhood: z.string().nullable(),
  space: z.string().nullable(),
  houseManual: z.string().nullable(),
  locale: z.string(),
});

export type PropertyDescriptions = z.infer<typeof PropertyDescriptionsSchema>;

export class PropertiesApi {
  constructor(private readonly api: HostfullyApi) {}

  async list(): Promise<Property[]> {
    return await Rx.firstValueFrom(
      Rx.defer(() =>
        scan(
          async (cursor) =>
            await this.api.transport.fetch({
              method: "GET",
              path: "/api/v3.1/properties",
              query: {
                agencyUid: this.api.agencyUid,
                _cursor: cursor,
                _limit: "100",
              },
              response: z.object({
                properties: z.array(PropertySchema),
                _paging: PagingSchema,
              }),
            }),
        ),
      ).pipe(
        Rx.mergeMap((resp) => resp.properties),
        Rx.toArray(),
      ),
    );
  }

  async patch(property: Property, update: PropertyPropertiesPatch) {
    await this.api.transport.fetch({
      path: `/api/v3.1/properties/${property.uid}`,
      method: "PATCH",
      body: update,
      response: null,
    });
  }

  async getCustomData(property: Property) {
    const fields = await this.api.transport.fetch({
      method: "GET",
      path: "/api/v3.1/custom-data",
      query: {
        propertyUid: property.uid,
      },
      response: z.object({
        customData: z.array(
          z.object({
            propertyUid: z.string().nullable(),
            leadUid: z.string().nullable(),
            unitUid: z.string().nullable(),
            text: z.string(),
            customDataField: z.object({
              agencyUid: z.string(),
              uid: z.string(),
              type: z.enum(["TEXT", "LONG_TEXT"]),
              name: z.string(),
              variable: z.string(),
              index: z.number(),
            }),
          }),
        ),
        _metadata: z.object({
          count: z.number(),
        }),
      }),
    });

    return new Map(
      fields.customData.flatMap((d): never[] | [string, string][] => {
        if (!d.propertyUid) {
          return [];
        }

        return [[d.customDataField.uid, d.text]];
      }),
    );
  }

  async setCustomData(property: Property, fieldUid: string, value: string) {
    await this.api.transport.fetch({
      method: "POST",
      path: "/api/v3.1/custom-data",
      body: {
        propertyUid: property.uid,
        customDataFieldUid: fieldUid,
        text: value,
      },
      response: null,
    });
  }

  async deleteCustomData(property: Property, fieldUid: string) {
    await this.api.transport.fetch({
      method: "DELETE",
      path: "/api/v3.1/custom-data",
      query: {
        propertyUid: property.uid,
        customDataFieldUid: fieldUid,
      },
      response: null,
    });
  }

  async getDescriptions(property: Property) {
    const resp = await this.api.transport.fetch({
      method: "GET",
      path: "/api/v3.1/property-descriptions",
      query: { propertyUid: property.uid },
      response: z.object({
        propertyDescriptions: z.array(PropertyDescriptionsSchema),
      }),
    });

    if (resp.propertyDescriptions.length !== 1) {
      throw new Error(
        `expected to get exactly one set of property descriptions for "${property.name}", got ${resp.propertyDescriptions.length}`,
      );
    }

    return resp.propertyDescriptions[0];
  }

  async updateDescriptions(
    property: Property,
    updates: Partial<PropertyDescriptions>,
  ) {
    const current = await this.getDescriptions(property);

    await this.api.transport.fetch({
      method: "PUT",
      path: `/api/v3.1/property-descriptions/${property.uid}`,
      body: {
        locale: current.locale,

        name: "name" in updates ? updates.name : current.name,
        shortSummary:
          "shortSummary" in updates
            ? updates.shortSummary
            : current.shortSummary,
        summary: "summary" in updates ? updates.summary : current.summary,
        notes: "notes" in updates ? updates.notes : current.notes,
        access: "access" in updates ? updates.access : current.access,
        transit: "transit" in updates ? updates.transit : current.transit,
        interaction:
          "interaction" in updates ? updates.interaction : current.interaction,
        neighbourhood:
          "neighbourhood" in updates
            ? updates.neighbourhood
            : current.neighbourhood,
        space: "space" in updates ? updates.space : current.space,
        houseManual:
          "houseManual" in updates ? updates.houseManual : current.houseManual,
      },
      response: null,
    });
  }
}
