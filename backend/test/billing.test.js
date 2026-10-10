import test from "node:test";
import assert from "node:assert/strict";
import { nextSubscriptionPeriod, subscriptionWalletBalance } from "../src/billing.js";

test("only verified top-up credits can fund renewal", async () => {
  const client = {
    walletTransaction: {
      aggregate: async ({ where }) => {
        if (where.type === "CREDIT") {
          assert.deepEqual(where.reference, { startsWith: "topup:" });
          return { _sum: { amountMinor: 50000 } };
        }
        assert.equal(where.type, "DEBIT");
        return { _sum: { amountMinor: 12000 } };
      },
    },
  };
  assert.equal(await subscriptionWalletBalance(client, "wallet_1"), 38000);
  assert.equal(await subscriptionWalletBalance(client, null), 0);
});

test("renewal period follows the subscription interval", () => {
  const start = new Date("2026-10-11T00:00:00.000Z");
  assert.equal(nextSubscriptionPeriod(start, "monthly").toISOString(), "2026-11-11T00:00:00.000Z");
  assert.equal(nextSubscriptionPeriod(start, "annually").toISOString(), "2027-10-11T00:00:00.000Z");
});
