import { z } from "zod";

import { gql } from "@spoot/gql";
import { Day } from "@spoot/day";
import { Schedule, Segment } from "@spoot/schedule";

import { Property } from "./PropertiesApi";
import { HostfullyApi } from "./HostfullyApi";

const DAYS_OF_WEEK =
  "sunday monday tuesday wednesday thursday friday saturday".split(" ");

export function* batches<T>(size: number, array: T[]) {
  for (
    let cursor = 0, batch = array.slice(cursor, size);
    batch.length > 0;
    cursor += size, batch = array.slice(cursor, size)
  ) {
    yield batch;
  }
}

interface PropertyPricingConfig {
  dailyRate: string;
  minimumStay: number;

  minimumWeekendStay: number;
  weekendRate: string;

  daysOfTheWeekToCheckInOn: Set<number>;
}

const PricingConfigQuery = (uid: string) => gql`
  query {
    property(uid: ${JSON.stringify(uid)}) {
      name
      availability {
        minimumStay
        minimumWeekendStay
        daysOfTheWeekToCheckInOn
      }
      pricing {
        dailyRate
        weekendAdjustmentRate
      }
    }
  }
`;

interface PricingOverride {
  day: Day;
  price: string;
  minNights: number;
  canCheckin: boolean;
  canCheckout: boolean;
}

const PricingOverrideResponseSchema = z.object({
  pricingPeriods: z.array(
    z.object({
      propertyUid: z.string(),
      date: z.string(),
      price: z.number(),
      minimumStay: z.number(),
      availableForCheckIn: z.boolean(),
      availableForCheckOut: z.boolean(),
      name: z.string().nullable(),
    }),
  ),
});

export type PricingScheduleData = {
  price: string;
  minNights: number;
  canCheckin: boolean;
  canCheckout: boolean;
};
export type PricingSchedule = Schedule<PricingScheduleData>;
export type PricingSegment = Segment<PricingScheduleData>;

const PricingRulePricingRuleSchema = z.object({
  uid: z.string(),
  ruleType: z.enum(["LAST_MINUTE_DISCOUNT", "EARLY_BIRD_DISCOUNT"]),
  threshold: z.number(),
  priceChange: z.number(),
  priceChangeType: z.literal("PERCENT"),
});

const PricingRulesSchema = z.object({
  increaseRate: z.number().nullable(),
  increaseRateLowerBound: z.number().nullable(),
  decreaseRate: z.number().nullable(),
  decreaseRateHigherBound: z.number().nullable(),
  decreaseRateMonthly: z.number().nullable(),
  decreaseRateHigherBoundMonthly: z.number().nullable(),
  enabledForAirbnb: z.boolean(),
  pricingRules: z.array(PricingRulePricingRuleSchema),
});

export type PricingRules = z.infer<typeof PricingRulesSchema>;
export type PricingRulesPricingRule = z.infer<
  typeof PricingRulePricingRuleSchema
>;

export type PricingRulesUpdate = Omit<PricingRules, "pricingRules"> & {
  pricingRules: Array<Omit<PricingRulesPricingRule, "uid"> & { uid?: string }>;
};

export class PricingApi {
  constructor(private readonly api: HostfullyApi) {}

  async get(property: Property): Promise<PropertyPricingConfig> {
    const resp = await this.api.transport.fetchGql(
      PricingConfigQuery(property.uid),
      z.object({
        property: z
          .object({
            name: z.string(),
            availability: z.object({
              minimumStay: z.number(),
              minimumWeekendStay: z.number(),
              daysOfTheWeekToCheckInOn: z.array(z.string()),
            }),
            pricing: z.object({
              dailyRate: z.string(),
              weekendAdjustmentRate: z.string(),
            }),
          })
          .optional(),
      }),
    );

    if (!resp.property) {
      throw new Error(`Unable to find property with uid: ${property.uid}`);
    }

    const {
      availability: {
        daysOfTheWeekToCheckInOn,
        minimumStay,
        minimumWeekendStay,
      },
      pricing: {
        dailyRate: dailyRateString,
        weekendAdjustmentRate: weekendAdjustmentRateString,
      },
    } = resp.property;

    const dailyRate = Number(dailyRateString);
    const weekendAdjustmentRate = Number(weekendAdjustmentRateString);

    return {
      dailyRate: dailyRate.toFixed(2),
      minimumStay,

      minimumWeekendStay:
        minimumWeekendStay > 0 ? minimumWeekendStay : minimumStay,

      weekendRate: (weekendAdjustmentRate > 0
        ? dailyRate + dailyRate * weekendAdjustmentRate
        : dailyRate
      ).toFixed(2),

      daysOfTheWeekToCheckInOn: new Set(
        daysOfTheWeekToCheckInOn.map((day) => {
          const index = DAYS_OF_WEEK.indexOf(day.toLowerCase());
          if (index === -1) {
            throw new Error(`Invalid day of the week: ${day}`);
          }
          return index;
        }),
      ),
    };
  }

  async getOverrides(property: Property, forMonthOf: Day) {
    const { pricingPeriods } = await this.api.transport.fetch({
      path: "/api/v3.1/pricing-periods",
      method: "GET",
      query: {
        propertyUid: property.uid,
        from: forMonthOf.startOfMonth.toJSON(),
        to: forMonthOf.endOfMonth.toJSON(),
      },
      response: PricingOverrideResponseSchema,
    });

    return pricingPeriods
      .map((p): PricingOverride => {
        const match = p.date.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!match) {
          throw new Error(`Invalid date format from Hostfully API: ${p.date}`);
        }

        return {
          day: new Day(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
          ),
          price: p.price.toFixed(2),
          minNights: p.minimumStay,
          canCheckin: p.availableForCheckIn,
          canCheckout: p.availableForCheckOut,
        };
      })
      .sort((a, b) => a.day.valueOf() - b.day.valueOf());
  }

  async *scan(
    property: Property,
    startingAt: Day,
    endingBefore: Day,
  ): AsyncGenerator<PricingSegment> {
    const pricingConfig = await this.get(property);

    let cursor = startingAt;
    let pricingOverrides: {
      startOfMonth: Day;
      periods: PricingOverride[];
    } | null = null;

    while (cursor < endingBefore) {
      // when we move to a new month, fetch the pricing overrides for that month
      if (
        !pricingOverrides ||
        pricingOverrides.startOfMonth.neq(cursor.startOfMonth)
      ) {
        pricingOverrides = {
          startOfMonth: cursor.startOfMonth,
          periods: await this.getOverrides(property, cursor.startOfMonth),
        };
      }

      const override = pricingOverrides.periods.find((p) => p.day.eq(cursor));
      const canCheckin = pricingConfig.daysOfTheWeekToCheckInOn.has(
        cursor.dayOfWeek,
      );
      if (override) {
        yield {
          startingAt: cursor,
          endingBefore: cursor.nextDay,
          data: {
            price: Number(override.price).toFixed(2),
            minNights: override.minNights,
            canCheckin: override.canCheckin,
            canCheckout: override.canCheckout,
          },
        };
      } else {
        if (cursor.isFridayOrSaturday) {
          yield {
            startingAt: cursor,
            endingBefore: cursor.nextDay,
            data: {
              price: Number(pricingConfig.weekendRate).toFixed(2),
              minNights: pricingConfig.minimumWeekendStay,
              canCheckin: canCheckin,
              canCheckout: canCheckin,
            },
          };
        } else {
          yield {
            startingAt: cursor,
            endingBefore: cursor.nextDay,
            data: {
              price: pricingConfig.dailyRate,
              minNights: pricingConfig.minimumStay,
              canCheckin: canCheckin,
              canCheckout: canCheckin,
            },
          };
        }
      }

      cursor = cursor.nextDay;
    }
  }

  async getRules(property: Property) {
    const resp = await this.api.transport.fetch({
      method: "GET",
      path: `/api/v3.1/property-pricing-rules/${property.uid}`,
      response: z.object({
        propertyPricingRules: PricingRulesSchema,
      }),
    });

    return resp.propertyPricingRules;
  }

  async setRules(property: Property, rules: PricingRulesUpdate) {
    await this.api.transport.fetch({
      method: "PUT",
      path: `/api/v3.1/property-pricing-rules/${property.uid}`,
      body: rules,
      response: null,
    });
  }
}
