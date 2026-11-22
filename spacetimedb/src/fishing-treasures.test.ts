import { Timestamp } from "spacetimedb";
import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { progressOf } from "../../tests/helpers/progress";
import { fishingSpotAt } from "../../shared/fishing";
import { FISHING_TREASURE_BOOST_DURATION_MS, fishingTimeFactor, rollFishingTreasure } from "../../shared/fishing-treasures";
import { FISHING_FILTER_MAIL_GEMS, FISHING_FILTER_MAIL_ID } from "../../shared/mailbox";
import { TOWN_FEET_OFFSET } from "../../shared/town";
import { MODULE_MIGRATION_VERSION } from "./module-migrations";
import { fishingTreasureBoostMultiplierAt } from "./fishing";
import { addOres, oreCount } from "./item-refine";
import { isOldMapGear } from "./old-gear-payout";
import { EQUIPMENT_DROP_ITEM_IDS, isCosmeticOnlyItem } from "../../shared/items";
import { BASE_INVENTORY_SLOT_CAPACITY } from "../../shared/gems";
import { COOK_FIRES } from "../../shared/cooking";
import { goldFor } from "./gold";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

describe("treasure on the line", () => {
  it("rolls gear alongside a real catch and awards it once, through the bag and drop reveal", () => {
    const f = crystalFixture(() => 0), spot = fishingSpotAt(0, 10_000);
    f.patch("player", { mapId: "town", x: spot.x, y: spot.y - TOWN_FEET_OFFSET });
    const catchFish = () => f.run(server.catchFish, { spot: spot.spot, site: spot.site });
    catchFish();
    expect(oreCount(f.ctx, f.ctx.sender, "minnow")).toBe(1);
    expect(JSON.parse(progressOf(f).inventoryJson)).toContain("reedward_cap");
    expect([...f.db.playerItemDrop.iter()][0]).toMatchObject({ itemId: "reedward_cap", sequence: 1n });
    expect(catchFish).toThrow(/Still fishing/);
    expect(f.db.playerFishing.identity.find(f.ctx.sender).fishCaught).toBe(1);
  });

  it("holds treasure as an offer when the bag fills and keeps the normal catch", () => {
    const f = crystalFixture(() => 0), spot = fishingSpotAt(0, 10_000);
    f.patch("player", { mapId: "town", x: spot.x, y: spot.y - TOWN_FEET_OFFSET });
    const stock = EQUIPMENT_DROP_ITEM_IDS.filter(id => !isCosmeticOnlyItem(id) && id !== "reedward_cap").slice(0, BASE_INVENTORY_SLOT_CAPACITY - 1);
    f.patch("playerProgress", { inventoryJson: JSON.stringify(stock) });
    f.transaction(() => addOres(f.ctx, f.ctx.sender, "minnow", 1));
    f.run(server.catchFish, { spot: spot.spot, site: spot.site });
    expect(oreCount(f.ctx, f.ctx.sender, "minnow")).toBe(2);
    expect(JSON.parse(progressOf(f).inventoryJson)).not.toContain("reedward_cap");
    expect([...f.db.pendingEquipmentOffer.iter()][0]?.itemId).toBe("reedward_cap");
    expect(isOldMapGear("reedward_cap")).toBe(false);
  });

  it("keeps the early odds as more treasures unlock and stacks bonuses only in their proper slots", () => {
    expect(rollFishingTreasure(14, 1 / 160)).toBeNull();
    expect(rollFishingTreasure(15, 1 / 160)?.rarity).toBe("Epic");
    expect(rollFishingTreasure(35, 1 / 160 + 1 / 600)?.rarity).toBe("Legendary");
    expect(rollFishingTreasure(99, .99)).toBeNull();
    expect(fishingTimeFactor("crown_of_the_wishing_deep", "drowned_court_mail")).toBeCloseTo(.84);
    expect(fishingTimeFactor("drowned_court_mail", "reedward_cap")).toBe(1);
  });

  it("ignores leftover loot filters, clears them in migration 69, sends apology gems, and doubles treasure odds for 24h", () => {
    const f = crystalFixture(() => 0.01), spot = fishingSpotAt(0, 10_000);
    f.patch("player", { mapId: "town", x: spot.x, y: spot.y - TOWN_FEET_OFFSET });
    // Before migration 69: leftover slot:HEAD / slot:CHEST rows exist, and normal Reedward Cap odds (1/160 = 0.00625) miss a 0.01 roll.
    f.seed("moduleMigrationState", { id: 0, version: 68 });
    f.seed("playerIgnoredDrop", { key: `${f.ctx.sender.toHexString()}:slot:HEAD`, identity: f.ctx.sender, itemId: "slot:HEAD" });
    f.seed("playerIgnoredDrop", { key: `${f.ctx.sender.toHexString()}:slot:CHEST`, identity: f.ctx.sender, itemId: "slot:CHEST" });
    expect(fishingTreasureBoostMultiplierAt(f.ctx, Number(f.ctx.timestamp.microsSinceUnixEpoch / 1000n))).toBe(1);

    // Run pending migrations via onConnect (same path Maincloud uses after publish).
    const connectionId = f.ctx.connectionId;
    f.ctx.connectionId = null;
    f.run(server.onConnect);
    f.ctx.connectionId = connectionId;
    expect(f.db.moduleMigrationState.id.find(0).version).toBe(MODULE_MIGRATION_VERSION);
    expect([...f.db.playerIgnoredDrop.iter()]).toEqual([]);
    const letter = f.db.mailboxLetter.id.find(FISHING_FILTER_MAIL_ID);
    expect(letter).toMatchObject({ id: FISHING_FILTER_MAIL_ID, gems: FISHING_FILTER_MAIL_GEMS });

    // During the 24h window: boost is 2x, so a 0.01 roll (0.01 / 2 = 0.005 < 1/160) now drops Reedward Cap — even if a stale slot:HEAD row somehow existed.
    f.seed("playerIgnoredDrop", { key: `${f.ctx.sender.toHexString()}:slot:HEAD`, identity: f.ctx.sender, itemId: "slot:HEAD" });
    const startMs = Number(f.ctx.timestamp.microsSinceUnixEpoch / 1000n);
    expect(fishingTreasureBoostMultiplierAt(f.ctx, startMs)).toBe(2);
    expect(fishingTreasureBoostMultiplierAt(f.ctx, startMs + FISHING_TREASURE_BOOST_DURATION_MS - 1)).toBe(2);
    expect(fishingTreasureBoostMultiplierAt(f.ctx, startMs + FISHING_TREASURE_BOOST_DURATION_MS)).toBe(1);
    f.run(server.catchFish, { spot: spot.spot, site: spot.site });
    expect(JSON.parse(progressOf(f).inventoryJson)).toContain("reedward_cap");
  });
});

it("level-locks fish, can burn at early levels, keeps cooked fish in inventory to sell or eat for temporary combat buffs", () => {
  const f = crystalFixture(), who = f.ctx.sender;
  f.transaction(() => { addOres(f.ctx, who, "minnow", 3); addOres(f.ctx, who, "trout", 1); });
  const cook = (fishId: string, recipeId: string) => f.run(server.cookFish, { fishId, recipeId });
  expect(() => cook("minnow", "skewer")).toThrow(/cooking fire/);
  f.patch("player", { mapId: "town", x: COOK_FIRES[0].x, y: COOK_FIRES[0].y - TOWN_FEET_OFFSET });
  // Fish level lock: Trout requires Cooking Lv 21.
  expect(() => f.run(server.beginCooking, { fishId: "trout", recipeId: "skewer" })).toThrow(/Cooking Lv 21/);
  expect(() => cook("minnow", "chowder")).toThrow(/Cooking Lv 12/);

  // Early-level burn: high roll (> 0.78) burns the Minnow (consumes raw fish, 0 cooked, 0 XP, 0 gold).
  const fixedRoll = (value: number) => Object.assign(() => value, { integerInRange: (min: number) => min });
  f.ctx.random = fixedRoll(0.99);
  f.run(server.beginCooking, { fishId: "minnow", recipeId: "skewer" });
  expect(() => cook("minnow", "skewer")).toThrow(/still cooking/);
  expect(oreCount(f.ctx, who, "minnow")).toBe(3);
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 3_000_000n);
  cook("minnow", "skewer");
  expect(oreCount(f.ctx, who, "minnow")).toBe(2);
  expect(oreCount(f.ctx, who, "cooked_minnow")).toBe(0);
  expect(goldFor(f.ctx, who)).toBe(0n);

  // Successful cook: low roll puts Cooked Minnow in inventory + grants Cooking XP (no instant gold).
  f.ctx.random = fixedRoll(0.01);
  f.run(server.beginCooking, { fishId: "minnow", recipeId: "skewer" });
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 3_000_000n);
  cook("minnow", "skewer");
  expect(() => cook("minnow", "skewer")).toThrow(/Start a dish/);
  expect(oreCount(f.ctx, who, "minnow")).toBe(1);
  expect(oreCount(f.ctx, who, "cooked_minnow")).toBe(1);
  expect(goldFor(f.ctx, who)).toBe(0n);
  expect([...f.db.playerCraftSkill.iter()][0]).toMatchObject({ skill: "cooking", experience: 2n });

  // Cook a second Minnow so we can both eat one and sell one.
  f.run(server.beginCooking, { fishId: "minnow", recipeId: "skewer" });
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 3_000_000n);
  cook("minnow", "skewer");
  expect(oreCount(f.ctx, who, "cooked_minnow")).toBe(2);

  // Eat one: activates a temporary Max HP buff (+5% for 5 min) and consumes 1 Cooked Minnow.
  f.run(server.eatFish, { fishId: "minnow" });
  expect(oreCount(f.ctx, who, "cooked_minnow")).toBe(1);
  const buff = f.db.playerFoodBuff.identity.find(who);
  expect(buff?.fishId).toBe("minnow");
  expect(buff?.endsAtMs).toBeGreaterThan(Number(f.ctx.timestamp.microsSinceUnixEpoch / 1000n));

  // Sell the remaining Cooked Minnow for gold (2g each).
  f.run(server.sellCookedFish, { oreId: "cooked_minnow", count: 1 });
  expect(oreCount(f.ctx, who, "cooked_minnow")).toBe(0);
  expect(goldFor(f.ctx, who)).toBe(2n);
});
