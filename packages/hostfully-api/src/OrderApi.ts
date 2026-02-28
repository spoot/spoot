import { z } from "zod";

import { HostfullyApi } from "./HostfullyApi";
import { Lead } from "./LeadsApi";

export const OrderFee = z.object({
  uid: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  amountType: z.enum(["AMOUNT", "TAX"]).nullable().optional(),
  isEditable: z.boolean().nullable().optional(),
  netPrice: z.number(),
  taxationRate: z.number(),
  taxAmount: z.number(),
  grossAmount: z.number(),
  grossPrice: z.number(),
});

export const OrderSchema = z.object({
  uid: z.string(),
  leadUid: z.string(),
  creationUtcDateTime: z.string(),
  updatedUtcDateTime: z.string(),
  rent: z.object({
    rentNetPrice: z.number(),
    rentBreakdowns: z
      .array(
        z.object({
          nightlyAmount: z.number(),
          nightlyDate: z.string(),
        }),
      )
      .nullable()
      .optional(),
    extraGuestsNetPrice: z.number(),
    listPrice: z.number(),
    discount: z
      .object({
        discountCode: z.string(),
        discountType: z.enum(["PERCENT", "AMOUNT"]),
        amount: z.number(),
        percent: z.number(),
      })
      .nullable()
      .optional(),
    netPrice: z.number(),
    taxationRate: z.number(),
    taxAmount: z.number(),
    grossPrice: z.number(),
  }),
  securityDeposit: z.number(),
  fees: z
    .object({
      cleaningFee: OrderFee,
      otherFees: z.array(OrderFee),
    })
    .nullable(),
  services: z
    .array(
      z.object({
        uid: z.string().nullable(),
        title: z.string().nullable(),
        grossPrice: z.number().nullable(),
        quantity: z.number().nullable(),
        quantityDescription: z.string().nullable(),
        serviceUid: z.string().nullable(),
      }),
    )
    .nullable()
    .optional(),
  adjustments: z
    .array(
      z.object({
        isPaid: z.boolean().nullable(),
        amount: z.number().nullable(),
      }),
    )
    .nullable()
    .optional(),
  rateMultiplier: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  totalAmount: z.number(),
  totalTaxesAmount: z.number(),
  channelCommission: z
    .object({
      amount: z.number(),
    })
    .nullable()
    .optional(),
  adjustmentItems: z
    .array(
      z.object({
        uid: z.string(),
        transactionType: z.enum(["CHARGE", "REFUND"]),
        adjustmentType: z.enum(["RENT", "TAX", "FEE", "SERVICE", "RESOLUTION"]),
        amount: z.number(),
        note: z.string(),
        createdUtcDateTime: z.string(),
        externalId: z.string(),
      }),
    )
    .nullable()
    .optional(),
  externalOrderId: z.string().nullable().optional(),
});
export type Order = z.infer<typeof OrderSchema>;

export class OrderApi {
  constructor(private readonly api: HostfullyApi) {}

  async getForLead(lead: Lead): Promise<Order> {
    const { orders } = await this.api.transport.fetch({
      method: "GET",
      path: "/api/v3.2/orders",
      query: {
        leadUid: lead.uid,
      },
      response: z.object({
        orders: z.array(OrderSchema),
        _metadata: z.object({
          count: z.number(),
          totalCount: z.number().nullable(),
        }),
      }),
    });

    if (orders.length === 0) {
      throw new Error("No orders found for lead");
    }

    if (orders.length > 1) {
      throw new Error("Multiple orders found for lead");
    }

    return orders[0];
  }
}
