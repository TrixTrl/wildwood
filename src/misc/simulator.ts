import { ArrowId } from "../../shared/arrows";
import { cardStatFactors, cardTotals } from "../../shared/card-effects";
import { ItemId, ItemLevel, itemMaxHealthMultiplierBonus, itemRegenerationMultiplierBonus } from "../../shared/items";
import { researchStatFactors } from "../../shared/player-power";
import { playerAttackCap, prestigePerkValue, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { type MasteryPoints } from "../../shared/weapon-mastery";
import { type WeaponSkillRoll } from "../../shared/weapon-skills";
import { createPersonalBosses } from "../game/runtime/boss/personal-bosses";
import { DamageSource } from "../game/runtime/dps-meter";
import { createEnemyLifecycle } from "../game/runtime/enemies/enemy-lifecycle";
import { createRegularEnemyRespawn, REGULAR_ENEMY_RESPAWN_SECONDS } from "../game/runtime/enemies/regular-enemy-respawn";
import { createGameBootstrap } from "../game/runtime/game-bootstrap";
import { createPlayerCombatController } from "../game/runtime/player-combat-controller";
import { createResearchController, type ResearchRanks } from "../game/runtime/research-controller";
import { MapId, TUTORIAL_FOREST_MAP_ID } from "../game/world";

type PlayerState = {
  head: { id: ItemId, level: ItemLevel };
  chest: { id: ItemId, level: ItemLevel };
  hand: { id: ItemId, level: ItemLevel, skills: WeaponSkillRoll };
  feet: { id: ItemId, level: ItemLevel };
  research: ResearchRanks;
  slotUpgrades: { head: number, chest: number, hand: number };
  cards: { weapon: string[], helmet: string[], armor: string[] };
  prestigePerks: PrestigePerkRanks;
  reflectCompletions: number;
  aggroCompletions: number;
  prestige: number;
  guildBonus: number;
  mastery: MasteryPoints;
  arrow?: ArrowId;
  autoFarmSettings: {};
};

type Time = { seconds: number, miliseconds: number };

type SimulationState = {
  arrowsShot: number;
  damageDealt: Record<DamageSource, number>;
  deaths: Record<MapId, number>;
  bossKills: Record<MapId, number>;
  ticks: number;
  startTime: number;
  runTime: number;
};

export function simulate(playerState: PlayerState, target: MapId): SimulationState {
  let running = true;
  const simulationState = {
    arrowsShot: 0,
    damageDealt: {},
    bossKills: {},
    ticks: 0,
    startTime: performance.now(),
    runTime: -1,
  } as SimulationState;
  const identity = "0000000000";
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
      if (playerState.head.id === itemId) return playerState.head.level;
      if (playerState.chest.id === itemId) return playerState.chest.level;
      if (playerState.feet.id === itemId) return playerState.feet.level;
      if (playerState.hand.id === itemId) return playerState.hand.level;
    },
  });
  const regularEnemyRespawn = createRegularEnemyRespawn(
    () => timeKeeper.miliseconds,
    1,
    () => REGULAR_ENEMY_RESPAWN_SECONDS,
    () => playerState.research.enemyRespawn,
    () => cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])).respawn,
  );
  const personalBosses = createPersonalBosses({
    mapId: () => currentMapId,
    identity: () => identity,
    alive: () => player.hp > 0,
    now: () => timeKeeper.miliseconds,
    respawns: respawnMemory,
    ready: () => true,
    defeated: (mapId) => {
      if (mapId === target) running = false;
    }
  });
  const playerCombat = createPlayerCombatController({
    player,
    enemies,
    spawnSites,
    projectileStore,
    bosses,
    nowSeconds: () => timeKeeper.seconds,
    engageEnemy,
    researchDamageMultiplier: research.damageMultiplier,
    researchRewardMultiplier: research.rewardMultiplier,
    prestigeDoubleStrike: () => prestigePerkValue(playerState.prestigePerks, "doubleStrike"),
    prestigeSplitShot: () => prestigePerkValue(playerState.prestigePerks, "splitShot"),
    prestigeReflect: () => prestigePerkValue(playerState.prestigePerks, "riposte"),
    prestigeBossSlayer: () => prestigePerkValue(playerState.prestigePerks, "bossSlayer"),
    prestigeSecondWind: () => prestigePerkValue(playerState.prestigePerks, "secondWind"),
    weaponSkills: () => playerState.hand.skills,
    weaponMastery: () => playerState.mastery,
    random: () => Math.random(),
    cards: () => cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon]),
    equippedWeapon: () => playerState.hand.id,
    weaponRating: () => playerState.hand.level && typeof (playerState.hand.level) !== "number" ? playerState.hand.level.attackSpeed ?? 0 : 0,
    equippedWeaponUpgradeLevel: () => playerState.hand.level,
    equippedHead: () => playerState.head.id,
    equippedHeadUpgradeLevel: () => playerState.head.level,
    equippedChest: () => playerState.chest.id,
    equippedChestUpgradeLevel: () => playerState.chest.level,
    equippedFeet: () => playerState.feet.id,
    equippedFeetUpgradeLevel: () => playerState.feet.level,
    healthMultiplierBonus,
    minAttackInterval: () => calcAttackSpeedCap(playerState),
    effectiveArmor: research.effectiveArmor,
    isDueling: () => false,
    scheduleEnemyRespawn: site => {
      regularEnemyRespawn.schedule(site);
      respawnMemory.remember(enemyRespawnKey(site), (site.respawnAt - timeKeeper.seconds) * 1000);
    },
    recordRegularEnemyDefeat: (mapId, enemy) => { },
    incrementKills: () => { },
    hitPersonalBoss: (damage, x, y, critical, reflected?) => personalBosses.hit(currentMapId, damage),
    hitGeneratedBoss: (enemy, damage, critical, reflected?) => { if (!enemy.generatedBoss) return false; personalBosses.hit(currentMapId, damage); return true; },
    reflectOnly: () => false,
    arrowInPlay: () => playerState.arrow ?? null,
    onArrowShot: () => simulationState.arrowsShot++,
    onDamageDealt: (amount, source, target) => simulationState.damageDealt[source] = (simulationState.damageDealt[source] ?? 0) + amount,
    onCombatTick: () => simulationState.ticks++,
    spawnBurst: (x, y, color?, count?, speed?) => { },
    spawnParticle: (x, y, vx, vy, life, maxLife, size, color) => { },
    spawnDamageNumber: (x, y, amount, critical?, damageTaken?, reflected?) => { },
    skillEffects: undefined,
    currentMapId: () => currentMapId,
    onEnemyDefeated: (enemy) => false,
    soulStatOf: (enemy) => null,
    onSoulKill: (stat) => { },
    soulRewardMultiplier: () => 0,
    onCombat: () => { },
    keepTarget: undefined,
    playBowAttackSound: undefined,
    playSwordAttackSound: undefined,
    logPickup: (text, color, value?) => { },
    saveProgress: () => { },
    recordDeath: () =>  simulationState.deaths[currentMapId] = (simulationState.deaths[currentMapId] ?? 0) +1 ,
    endGame: () => {},
  });

  return simulationState;
}

function createRespawnMemory(time: Time) {
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

function calcAttackSpeedCap(playerState: PlayerState) {
  const baseCap = playerAttackCap({ active: false, completed: playerState.reflectCompletions }, playerState.prestigePerks);
  const cardCap = cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])).attackCapRaise;
  baseCap.raise += cardCap;
  return baseCap;
}
