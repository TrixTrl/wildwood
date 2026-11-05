import { cardStatFactors, cardTotals } from "../../shared/card-effects";
import { CardEffectId } from "../../shared/cards";
import { itemDefinition, ItemId, itemMaxHealthMultiplierBonus, itemRegenerationMultiplierBonus } from "../../shared/items";
import { researchStatFactors } from "../../shared/player-power";
import { type PrestigePerkRanks } from "../../shared/prestige-perks";
import { createEnemyLifecycle } from "../game/runtime/enemies/enemy-lifecycle";
import { createGameBootstrap } from "../game/runtime/game-bootstrap";
import { createPlayerCombatController } from "../game/runtime/player-combat-controller";
import { createResearchController, type ResearchRanks } from "../game/runtime/research-controller";
import { TUTORIAL_FOREST_MAP_ID } from "../game/world";

type PlayerState = {
  head: { id: ItemId, refineLevel: number };
  chest: { id: ItemId, refineLevel: number };
  hand: { id: ItemId, refineLevel: number };
  feet: { id: ItemId, refineLevel: number };
  research: ResearchRanks;
  slotUpgrades: { head: number, chest: number, hand: number };
  cards: { weapon: string[], helmet: string[], armor: string[] };
  prestigePerks: PrestigePerkRanks;
  reflectCompletions: number;
  aggroCompletions: number;
  prestige: number;
  guildBonus: number;
};

export function simulate(playerState: PlayerState) {
  const bootstrap = createGameBootstrap();
  const {
    bosses, bossHazards, bootsPickup, enemies, enemyShots, inventory, mapConfig: MAP_CONFIG, player, projectiles, projectileStore, spawnSites,
  } = bootstrap;
  const timeKeeper = { seconds: 0, miliseconds: 0 };
  const respawnMemory = createRespawnMemory(timeKeeper);
  let currentMapId = TUTORIAL_FOREST_MAP_ID;
  const enemyRespawnKey = (site: typeof spawnSites[number]) => `enemy:${currentMapId}:${site.id}:${site.type}:${site.campName}`;
  const enemyLifecycle = createEnemyLifecycle(enemies, spawnSites, (x: number, y: number) => { }, {
    remaining: site => respawnMemory.remaining(enemyRespawnKey(site)),
    gameTime: () => timeKeeper.miliseconds,
  });
  const { spawnFromSite, engageEnemy, updateRespawns } = enemyLifecycle;
  const playerStats = createPlayerStatsRuntime(playerState);
  const { healthMultiplierBonus, regenerationPerSecond } = playerStats;
  const research = createResearchController({
    player,
    getRanks: () => playerState.research,
    isDueling: () => false,
    maxPlayerStat: 0,
    saveProgress: () => { },
    healthMultiplierBonus,
    prestigeLevel: () => playerState.prestige,
    guildQuestBonus: () => playerState.guildBonus,
    prestigePerks: () => playerState.prestigePerks,
    cards: () => cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])),
    equippedFeet: () => playerState.feet.id,
    equippedWeapon: () => playerState.hand.id,
    itemLevel: (itemId: string) => {
      if (playerState.head.id === itemId) return playerState.head.refineLevel;
      if (playerState.chest.id === itemId) return playerState.chest.refineLevel;
      if (playerState.feet.id === itemId) return playerState.feet.refineLevel;
      //if (playerState.hand.id === itemId) return {tier:itemDefinition(playerState.hand.id)?.};

    },
  });
  /*const playerCombat = createPlayerCombatController({
    player,
    enemies,
    spawnSites,
    projectileStore,
    bosses,
    nowSeconds: () => timeKeeper.seconds,
    engageEnemy,

  });*/
}

function createRespawnMemory(time: { seconds: number, miliseconds: number }) {
  const deadlines: Record<string, number> = {};
  return {
    remaining(key: string) { return Math.max(0, (deadlines[key] ?? 0) - time.miliseconds) },
    remember(key: string, delayMs: number) {
      const at = time.miliseconds;
      for (const key of Object.keys(deadlines)) if (deadlines[key] <= at) delete deadlines[key];
      deadlines[key] = at + Math.min(delayMs, 120_000);
    },
    clear() { for (const key of Object.keys(deadlines)) delete deadlines[key]; },
  }
}

function createPlayerStatsRuntime(playerState: PlayerState) {
  return {
    healthMultiplierBonus: () => {
      const gearBonus = itemMaxHealthMultiplierBonus(playerState.chest, playerState.slotUpgrades.chest);
      const researchBonus = researchStatFactors(playerState.research).maxHp;
      const cardBonus = cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])).maxHp;
      return gearBonus * researchBonus * cardBonus - 1;
    },
    regenerationPerSecond: () => {
      const gearBonus = itemRegenerationMultiplierBonus(playerState.head, playerState.slotUpgrades.head);
      const researchBonus = researchStatFactors(playerState.research).regen;
      const cardBonus = cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])).regen;
      return gearBonus * researchBonus * cardBonus - 1;
    }
  }
}
