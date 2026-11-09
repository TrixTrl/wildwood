import { PlayerGender } from "../../shared/player-gender";
import { ResearchId } from "../../shared/research";
import type { PlayerProgress } from "../coop/services/progress";
import { PlayerLifetime } from "../coop/contracts";
import { type DbConnection, tables } from "../module_bindings";
import { ProfileDirectory } from "../coop/services/profile-directory";
import { ActiveSubscription, unsubscribeIfActive } from "../coop/services/subscription-handoff";
import { ProgressionService } from "../coop/services/progression-service";
import { withWideProgress } from "../coop/services/wide-progress";
import { hexStringToU256, Identity } from "spacetimedb";

export type PlayerResearch = Record<ResearchId, number>;

export type PlayerProfileData = {
  prestigeChallenge?: import("../../shared/prestige-challenge").PrestigeChallenge;
  aggroChallenge?: import("../../shared/aggro-challenge").AggroChallenge;
  prestigeLevel?: number;
  /** Another player's Guild stat gain (get_stat_gain_bonus), once the server answers; your own comes from weeklyQuests. */
  questBonus?: number;
  prestigePerks?: Partial<import("../../shared/prestige-perks").PrestigePerkRanks>;
  /** Their soul stats as the server holds them (profile_soul_stats), null with none; the profile drops them during a challenge. */
  soulStats?: import("../../shared/soul-dimension").SoulStats | null;
  identity: string;
  name: string;
  gender: PlayerGender;
  progress: PlayerProgress;
  research: PlayerResearch;
  itemUpgradeLevels: Record<string, number>;
  /** Each first copy's refine by item id (player_item_refine); the worn items' are what stats read. +0 is missing. */
  itemRefines?: Record<string, number>;
  /** Each weapon's rolled speed and crit levels (first copies, player_weapon_stat). */
  weaponStats?: Record<string, { attackSpeed: number; critDamage: number }>;
  /** Each unlocked look's kept refine by item id (player_cosmetic_refine): a look's ★10/★20 art, never its stats. */
  cosmeticRefines?: Record<string, number>;
  /** The bonus item ids they switched off (player_bonus_toggle): profiles count stats with them left out, as the server does. */
  bonusOff?: readonly string[];
  /** The active cards they chose by type (player_active_card), waiting ones included; profileActiveCardIds keeps those in play. */
  activeCards?: import("../../shared/active-cards").ActiveCards;
  /** The equipped weapon's skill roll (player_worn_skill), for showing it on the profile. */
  wornSkill?: { itemId: string; roll: Record<string, number> } | null;
  /** The Mining stat (my_mining for your own, player_mining_level for anyone else's); null before their first rock. */
  mining?: number | null;
  /** The Woodcutting stat (my_woodcutting for your own, player_woodcutting_level for anyone else's); null before their first tree. */
  woodcutting?: number | null;
  /** The Fishing level (from my_fishing for your own, player_fishing_level for anyone else's); null before their first fish. */
  fishing?: number | null;
  /** Weapon Mastery levels by school (player_weapon_mastery for your own, player_mastery_level for anyone else's); a missing school is level 0. */
  mastery?: Partial<Record<import("../../shared/weapon-mastery").WeaponSchool, number>> | null;
  /** Craft levels (my_craft_skills for your own, player_craft_level for anyone else's); a craft never practised is missing. */
  crafts?: Partial<Record<import("../../shared/crafting").CraftSkill, number>> | null;
  lifetime: PlayerLifetime;
  mapId?: string;
};

export function createStalker(dependencies: {
  connection: () => DbConnection | null;
  directory: ProfileDirectory;
  progression: ProgressionService;
}) {

  const killValues = new Map<bigint, { name: string, data: { kills: number, timestamp: number }[] }>();

  function printInterestingKillValues() {
    const interestingValues = [...killValues.entries()].filter(([key, value]) => value.data.length > 1).map(([key, value]) => ({ identity: key, data: value.data, name: value.name }))
    //console.log(interestingValues);
    const intervalMs = 1000_000;

    const processedData = interestingValues.map(v => {
      const lastValue = v.data[v.data.length - 1];
      const relevantDataIndex = Math.max(0, v.data.findIndex(d => lastValue.timestamp - d.timestamp < intervalMs) - 1);
      const startValue = v.data[relevantDataIndex];
      const kills = lastValue.kills - startValue.kills;
      const time = lastValue.timestamp - startValue.timestamp + 1;
      return { identity: v.identity.toString(), killRate: (kills / time * 1000), name: v.name, kills: kills, time: time, dataPoints: (v.data.length - relevantDataIndex), lastUpdate: lastValue.timestamp };
    });
    console.log(processedData.filter(d => d.dataPoints > 2 && d.lastUpdate > performance.now() - intervalMs).sort((a, b) => b.killRate - a.killRate).map(d => JSON.stringify(d)).join('\n'));
  }

  async function loadPlayerProfile(identity: string): Promise<null> {
    const connection = dependencies.connection();
    const dbIdentity = new Identity(identity);

    if (!connection || !dbIdentity) return Promise.resolve(null);

    const bonus = await connection.procedures.getStatGainBonus({ identity: dbIdentity });

    const dumpRow: Parameters<typeof connection.db.player.onUpdate>[0] = row => {
      const lifetimeRows = [...row.db.playerLifetime.iter()];
      const profileRows = [...row.db.playerProfile.iter()];

      lifetimeRows.forEach(r => {
        const newData = { kills: Number(r.enemyKills), timestamp: performance.now() };
        const killSlot = killValues.get(r.identity.__identity__);
        if (killSlot) {
          if (newData.kills > killSlot.data[killSlot.data.length - 1].kills)
            killSlot.data.push(newData);
        } else {
          killValues.set(r.identity.__identity__, ({ name: (profileRows.find(p => r.identity.__identity__ === p.identity.__identity__)?.displayName ?? "<NAME MISSING FOR SOME REASON>"), data: ([newData]) }));
        }
      });

      //console.log(killValues);
      printInterestingKillValues();

      const fullData = {
        bonus,
        playerProfile: [...row.db.playerProfile.iter()].find(row => row.identity.toHexString() === identity),
        playerAccountStatus: [...row.db.playerAccountStatus.iter()].find(row => row.identity.toHexString() === identity),
        playerProgress: [...row.db.playerProgress.iter()].find(row => row.identity.toHexString() === identity),
        playerInventory: [...row.db.playerInventory.iter()].find(row => row.identity.toHexString() === identity),
        playerChatHearts: [...row.db.playerChatHearts.iter()].find(row => row.identity.toHexString() === identity),
        playerLifetime: [...row.db.playerLifetime.iter()].find(row => row.identity.toHexString() === identity),
        playerResearch: [...row.db.playerResearch.iter()].find(row => row.identity.toHexString() === identity),
        playerLuckResearch: [...row.db.playerLuckResearch.iter()].find(row => row.identity.toHexString() === identity),
        playerPrestige: [...row.db.playerPrestige.iter()].find(row => row.identity.toHexString() === identity),
        playerPrestigePerk: [...row.db.playerPrestigePerk.iter()].find(row => row.identity.toHexString() === identity),
        playerPrestigeChallenge: [...row.db.playerPrestigeChallenge.iter()].find(row => row.identity.toHexString() === identity),
        playerAggroChallenge: [...row.db.playerAggroChallenge.iter()].find(row => row.identity.toHexString() === identity),
        playerPrestigeExpansionPerk: [...row.db.playerPrestigeExpansionPerk.iter()].find(row => row.identity.toHexString() === identity),
        profileSoulStats: [...row.db.profileSoulStats.iter()].find(row => row.identity.toHexString() === identity),
        playerItemUpgrade: [...row.db.playerItemUpgrade.iter()].find(row => row.identity.toHexString() === identity),
        playerItemRefine: [...row.db.playerItemRefine.iter()].find(row => row.identity.toHexString() === identity),
        playerWeaponStat: [...row.db.playerWeaponStat.iter()].find(row => row.identity.toHexString() === identity),
        playerCosmeticRefine: [...row.db.playerCosmeticRefine.iter()].find(row => row.identity.toHexString() === identity),
        playerActiveCard: [...row.db.playerActiveCard.iter()].find(row => row.identity.toHexString() === identity),
        playerPrestigeCardPerk: [...row.db.playerPrestigeCardPerk.iter()].find(row => row.identity.toHexString() === identity),
        playerBonusToggle: [...row.db.playerBonusToggle.iter()].find(row => row.identity.toHexString() === identity),
        playerWornSkill: [...row.db.playerWornSkill.iter()].find(row => row.identity.toHexString() === identity),
        playerWornStaffSkill: [...row.db.playerWornStaffSkill.iter()].find(row => row.identity.toHexString() === identity),
        playerMiningLevel: [...row.db.playerMiningLevel.iter()].find(row => row.identity.toHexString() === identity),
        playerWoodcuttingLevel: [...row.db.playerWoodcuttingLevel.iter()].find(row => row.identity.toHexString() === identity),
        playerFishingLevel: [...row.db.playerFishingLevel.iter()].find(row => row.identity.toHexString() === identity),
        playerMasteryLevel: [...row.db.playerMasteryLevel.iter()].find(row => row.identity.toHexString() === identity),
        playerCraftLevel: [...row.db.playerCraftLevel.iter()].find(row => row.identity.toHexString() === identity),
        player: [...row.db.player.iter()].find(row => row.identity.toHexString() === identity),

        playerGold: [...row.db.playerGold.iter()].find(row => row.identity.toHexString() === identity),
        leaderboardEntry: [...row.db.leaderboardEntry.iter()].find(row => row.identity.toHexString() === identity),
        playerFreeRespec: [...row.db.playerFreeRespec.iter()].find(row => row.identity.toHexString() === identity),
      };
      //console.log(fullData);
    };

    const update: Parameters<typeof connection.db.player.onUpdate>[0] = dumpRow;

    connection.db.player.onUpdate(update);
    const detachPresence = () => {
      connection.db.player.removeOnUpdate(update);
    };

    let settled = false;
    const request = new Promise<null>((resolve) => {
      let timeoutId: number | null = null;
      const finish = (profile: PlayerProfileData | null) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        resolve(null);
      };
      const cancel = () => finish(null);
      let handle: ActiveSubscription | null = null;
      try {
        handle = connection
          .subscriptionBuilder()
          .onApplied(() => {
            if (dependencies.connection() !== connection) {
              unsubscribeIfActive(handle);
              return finish(null);
            }
            for (const row of connection.db.playerProgress.iter()) {
              if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertProgress(withWideProgress(connection, row));
            }
            for (const row of connection.db.playerChatHearts.iter()) {
              if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertChatHearts(row);
            }
            for (const row of connection.db.playerLifetime.iter()) {
              if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertLifetime(row);
            }
            for (const row of connection.db.playerResearch.iter()) {
              if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertResearch(row);
            }
            for (const row of connection.db.playerLuckResearch.iter()) {
              if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertLuckResearch(row);
            }
            for (const row of connection.db.playerItemUpgrade.iter()) {
              if (row.identity.toHexString() === identity) dependencies.progression.tables.upsertItemUpgrade(row);
            }
            for (const row of connection.db.playerProfile.iter()) {
              if (row.identity.toHexString() === identity) dependencies.directory.tables.upsertProfile(row);
            }
            for (const row of connection.db.playerAccountStatus.iter()) {
              if (row.identity.toHexString() === identity) dependencies.directory.tables.upsertAccountStatus(row);
            }
            let rowVisible = false;
            for (const row of connection.db.player.iter()) {
              if (row.identity.toHexString() !== identity) continue;
              rowVisible = true;
            }
            finish(null);
          })
          .onError(() => {
            detachPresence();
            unsubscribeIfActive(handle);
            finish(null);
          })
          .subscribe([
            tables.playerProfile.where((profile) => true/*profile.identity.eq(dbIdentity)*/),
            tables.playerAccountStatus.where((status) => status.identity.eq(dbIdentity)),
            tables.playerProgress.where((progress) => progress.identity.eq(dbIdentity)),
            tables.playerInventory.where((bag) => bag.identity.eq(dbIdentity)),
            tables.playerChatHearts.where((player) => player.identity.eq(dbIdentity)),
            tables.playerLifetime.where((lifetime) => true/*lifetime.identity.eq(dbIdentity)*/),
            tables.playerResearch.where((research) => research.identity.eq(dbIdentity)),
            tables.playerLuckResearch.where((research) => research.identity.eq(dbIdentity)),
            tables.playerPrestige.where((player) => player.identity.eq(dbIdentity)),
            tables.playerPrestigePerk.where((player) => player.identity.eq(dbIdentity)),
            tables.playerPrestigeChallenge.where((player) => player.identity.eq(dbIdentity)),
            tables.playerAggroChallenge.where((player) => player.identity.eq(dbIdentity)),
            tables.playerPrestigeExpansionPerk.where((player) => player.identity.eq(dbIdentity)),
            tables.profileSoulStats.where((player) => player.identity.eq(dbIdentity)),
            tables.playerItemUpgrade.where((upgrade) => upgrade.identity.eq(dbIdentity)),
            tables.playerItemRefine.where((player) => player.identity.eq(dbIdentity)),
            tables.playerWeaponStat.where((player) => player.identity.eq(dbIdentity)),
            tables.playerCosmeticRefine.where((player) => player.identity.eq(dbIdentity)),
            tables.playerActiveCard.where((player) => player.identity.eq(dbIdentity)),
            tables.playerPrestigeCardPerk.where((player) => player.identity.eq(dbIdentity)),
            tables.playerBonusToggle.where((player) => player.identity.eq(dbIdentity)),
            tables.playerWornSkill.where((player) => player.identity.eq(dbIdentity)),
            tables.playerWornStaffSkill.where((player) => player.identity.eq(dbIdentity)),
            tables.playerMiningLevel.where((player) => player.identity.eq(dbIdentity)),
            tables.playerWoodcuttingLevel.where((player) => player.identity.eq(dbIdentity)),
            tables.playerFishingLevel.where((player) => player.identity.eq(dbIdentity)),
            tables.playerMasteryLevel.where((player) => player.identity.eq(dbIdentity)),
            tables.playerCraftLevel.where((player) => player.identity.eq(dbIdentity)),
            tables.player.where((player) => true/*player.identity.eq(dbIdentity)*/),


            tables.playerGold.where((player) => player.identity.eq(dbIdentity)),
            tables.leaderboardEntry.where((player) => player.identity.eq(dbIdentity)),
            tables.playerFreeRespec.where((player) => player.identity.eq(dbIdentity)),
          ]);
      } catch {
        finish(null);
      }
      if (!settled) {
        timeoutId = window.setTimeout(() => {
          finish(null);
        }, 5000);
      }
    });
    return request;
  }

  return ({ loadPlayerProfile });
}
