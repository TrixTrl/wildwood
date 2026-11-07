import { ArrowId } from "../../shared/arrows";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { cardStatFactors, cardTotals, cardValue } from "../../shared/card-effects";
import { ENEMY_BASE_VALUES } from "../../shared/enemy-base-values";
import { isWeaponItem, ItemId, ItemLevel, itemMaxHealthMultiplierBonus, itemRegenerationMultiplierBonus } from "../../shared/items";
import { MapBalanceSnapshot } from "../../shared/map-balance-types";
import { researchStatFactors } from "../../shared/player-power";
import { blackBootsSpeed, gearMoveSpeedFactor } from "../../shared/player-stats";
import { playerAttackCap, prestigePerkValue, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { PROCEDURAL_PREFIX } from "../../shared/procedural-map-core";
import { utilityMovementSpeedBonus } from "../../shared/research";
import { DEFAULT_ATTACK_INTERVAL, movementSpeedMultiplier, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN, PLAYER_SPEED } from "../../shared/rules";
import { SoulStats } from "../../shared/soul-dimension";
import { type MasteryPoints } from "../../shared/weapon-mastery";
import { type WeaponSkillRoll } from "../../shared/weapon-skills";
import { BASE_ATTACK_RANGE, BASE_PROJECTILE_SPEED } from "../game/constants";
import { createAutoFarmProgress } from "../game/runtime/auto-farm/auto-farm-build";
import { createAutoFarmController } from "../game/runtime/auto-farm/auto-farm-controller";
import { AUTO_FARM_ADVANCE_KEY, AUTO_FARM_BOSS_PULL_KEY, AUTO_FARM_KITE_KEY, AUTO_FARM_MOVE_POWER_KEY, AUTO_FARM_PORTAL_PULL_KEY, AUTO_FARM_SMART_AUTOFARM_KEY, AUTO_FARM_SMART_BOSS_KEY, evenShares } from "../game/runtime/auto-farm/auto-farm-plan";
import { AUTO_FARM_PULL_GROUPS_KEY, AUTO_FARM_PULL_KEY } from "../game/runtime/auto-farm/auto-farm-priority";
import { createBossController } from "../game/runtime/boss/boss-controller";
import { BOSSES, bossForMap, bossStateForMap } from "../game/runtime/boss/boss-registry";
import { createPersonalBosses } from "../game/runtime/boss/personal-bosses";
import { createProceduralBossController } from "../game/runtime/boss/procedural-boss-controller";
import { DamageSource } from "../game/runtime/dps-meter";
import { createEnemyLifecycle } from "../game/runtime/enemies/enemy-lifecycle";
import { createEnemySimulation } from "../game/runtime/enemies/enemy-simulation";
import { createRegularEnemyRespawn, REGULAR_ENEMY_RESPAWN_SECONDS } from "../game/runtime/enemies/regular-enemy-respawn";
import { createGameBootstrap } from "../game/runtime/game-bootstrap";
import { createMapController } from "../game/runtime/map-controller";
import { createPlayerCombatController, PlayerCombatController } from "../game/runtime/player-combat-controller";
import { createPlayerController } from "../game/runtime/player-controller";
import { createCamera } from "../game/runtime/render/camera";
import { createResearchController, type ResearchRanks } from "../game/runtime/research-controller";
import { weaponAttackRange } from "../game/weapon-combat";
import { MapId, TUTORIAL_FOREST_MAP_ID } from "../game/world";

type PlayerState = {
  head?: { id: ItemId, level: ItemLevel };
  chest?: { id: ItemId, level: ItemLevel };
  hand?: { id: ItemId, level: ItemLevel, skills: WeaponSkillRoll };
  feet?: { id: ItemId, level: ItemLevel };
  research: ResearchRanks;
  slotUpgrades: { head: number, chest: number, hand: number };
  cards: { weapon: string[], helmet: string[], armor: string[] };
  prestigePerks: Partial<PrestigePerkRanks>;
  reflectCompletions: number;
  aggroCompletions: number;
  prestige: number;
  guildBonus: number;
  mastery: MasteryPoints;
  arrow?: ArrowId;
  autoFarmSettings: Partial<Record<typeof AUTO_FARM_PULL_KEY | typeof AUTO_FARM_ADVANCE_KEY | typeof AUTO_FARM_PULL_GROUPS_KEY | typeof AUTO_FARM_KITE_KEY | typeof AUTO_FARM_BOSS_PULL_KEY | typeof AUTO_FARM_PORTAL_PULL_KEY | typeof AUTO_FARM_SMART_AUTOFARM_KEY | typeof AUTO_FARM_SMART_BOSS_KEY | typeof AUTO_FARM_MOVE_POWER_KEY, string>>;
  soulStats: SoulStats
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

export async function simulate(playerState: PlayerState, target: MapId): Promise<SimulationState> {
  let running = true;
  const simulationState = {
    arrowsShot: 0,
    damageDealt: {},
    deaths: {},
    bossKills: {},
    ticks: 0,
    startTime: performance.now(),
    runTime: -1,
  } as SimulationState;
  const identity = "simulated-player";
  const bootstrap = createGameBootstrap();
  const {
    bosses, bossHazards, bootsPickup, enemies, enemyShots, inventory, mapConfig: MAP_CONFIG, player, projectiles, projectileStore, spawnSites,
  } = bootstrap;
  const timeKeeper = { seconds: 0, miliseconds: 0 };
  const respawnMemory = createRespawnMemory(timeKeeper);
  let currentMapId: MapId = TUTORIAL_FOREST_MAP_ID;
  const enemyRespawnKey = (site: typeof spawnSites[number]) => `enemy:${currentMapId}:${site.id}:${site.type}:${site.campName}`;
  const enemyLifecycle = createEnemyLifecycle(enemies, spawnSites, (x: number, y: number) => { }, {
    remaining: site => respawnMemory.remaining(enemyRespawnKey(site)),
    gameTime: () => timeKeeper.miliseconds,
  });
  const { spawnFromSite, engageEnemy, updateRespawns } = enemyLifecycle;
  let playerCombat: ReturnType<typeof createPlayerCombatController>;
  const playerStats = createPlayerStatsRuntime(playerState, () => playerCombat?.tailwind());
  const { healthMultiplierBonus, regenerationPerSecond } = playerStats;
  const research = createResearchController({
    player,
    getRanks: () => playerState.research,
    isDueling: () => false,
    maxPlayerStat: Infinity,
    saveProgress: () => { },
    healthMultiplierBonus,
    prestigeLevel: () => playerState.prestige,
    guildQuestBonus: () => playerState.guildBonus,
    prestigePerks: () => playerState.prestigePerks,
    cards: () => cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])),
    equippedFeet: () => playerState.feet?.id ?? "",
    equippedWeapon: () => playerState.hand?.id ?? "",
    itemLevel: (itemId: string) => {
      if (playerState.head?.id === itemId) return playerState.head.level;
      if (playerState.chest?.id === itemId) return playerState.chest.level;
      if (playerState.feet?.id === itemId) return playerState.feet.level;
      if (playerState.hand?.id === itemId) return playerState.hand.level;
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
  const proceduralBoss = createProceduralBossController({
    mapId: () => currentMapId, state: mapId => ({ boss: personalBosses.proceduralState(mapId) }),
    enemies, player, spawn: spawnFromSite,
    damagePlayer: (damage, source) => playerCombat.damagePlayer(damage, source),
    damageEnemies: (attack, amount, inside) => playerCombat.damageEnemiesFromBoss(attack, amount, inside),
    collideEnemies: boss => playerCombat.pushEnemiesFromBoss(boss), burst: (x, y, color, count?, speed?) => { }, shot: projectileStore.spawnEnemyShot,
  });
  playerCombat = createPlayerCombatController({
    player,
    enemies,
    spawnSites,
    projectileStore,
    bosses,
    nowSeconds: () => timeKeeper.seconds,
    engageEnemy,
    researchDamageMultiplier: research.damageMultiplier,
    researchCriticalChance: research.criticalChance,
    researchCriticalDamageMultiplier: research.criticalDamageMultiplier,
    researchRewardMultiplier: research.rewardMultiplier,
    prestigeDoubleStrike: () => prestigePerkValue(playerState.prestigePerks, "doubleStrike"),
    prestigeSplitShot: () => prestigePerkValue(playerState.prestigePerks, "splitShot"),
    prestigeReflect: () => prestigePerkValue(playerState.prestigePerks, "riposte"),
    prestigeBossSlayer: () => prestigePerkValue(playerState.prestigePerks, "bossSlayer"),
    prestigeSecondWind: () => prestigePerkValue(playerState.prestigePerks, "secondWind"),
    weaponSkills: () => playerState.hand?.skills,
    weaponMastery: () => playerState.mastery,
    random: () => Math.random(),
    cards: () => cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon]),
    equippedWeapon: () => playerState.hand?.id ?? "",
    weaponRating: playerState.hand?.level && typeof (playerState.hand.level) !== "number" ? () => playerState.hand?.level && typeof (playerState.hand.level) !== "number" ? playerState.hand.level.attackSpeed ?? 0 : 0 : undefined,
    equippedWeaponUpgradeLevel: () => playerState.hand?.level,
    equippedHead: () => playerState.head?.id ?? "",
    equippedHeadUpgradeLevel: () => playerState.head?.level,
    equippedChest: () => playerState.chest?.id ?? "",
    equippedChestUpgradeLevel: () => playerState.chest?.level,
    equippedFeet: () => playerState.feet?.id ?? "",
    equippedFeetUpgradeLevel: () => playerState.feet?.level,
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
    recordDeath: () => simulationState.deaths[currentMapId] = (simulationState.deaths[currentMapId] ?? 0) + 1,
    endGame: () => { },
  });
  const mapPortals = () => {
    const config = bootstrap.mapConfig[currentMapId];
    return [config.portal, "secondaryPortal" in config ? config.secondaryPortal : null];
  };
  const autoFarmProgress = createAutoFarmProgress({
    mapId: () => currentMapId,
    fetchBalance: mapId => undefined,
    base: () => ({ maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen }),
    equipment: () => ({
      equippedHead: playerState.head?.id, equippedChest: playerState.chest?.id, equippedFeet: playerState.feet?.id,
      equippedRightHand: playerState.hand?.id, equippedLeftHand: undefined,
    }),
    weaponSkills: () => playerState.hand?.skills,
    research: research.ranks,
    upgradeLevel: () => playerState.hand?.level,
    cards: () => cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon]),
    rewardMultiplier: research.rewardMultiplier,
    minAttackInterval: () => calcAttackSpeedCap(playerState),
    criticalChance: research.criticalChance,
    criticalMultiplier: (extra = 0) => research.criticalDamageMultiplier(playerState.soulStats.critDamage, (player.critRating ?? 0) + extra),
    reflectOnly: () => false,
    mapBoss: () => proceduralBoss.boss() ?? bossStateForMap(bootstrap.bosses, currentMapId),
    portalUnlocked: (portal) => simulationState.bossKills[convertFromMapIndex(convertToMapIndex(portal.destination as MapId) - 1) ?? TUTORIAL_FOREST_MAP_ID] !== undefined,
    portals: mapPortals,
  });
  const autoFarmStorage = createAutoFarmStorage(playerState);
  const autoFarm = createAutoFarmController({
    player,
    enemies,
    spawnSites,
    mapId: () => currentMapId,
    equippedWeapon: () => playerState.hand?.id ?? "",
    localIdentity: () => identity,
    connection: () => "ready",
    now: () => timeKeeper.miliseconds,
    resumeStore: undefined,
    unavailable: () => null,
    paused: () => false,
    speed: playerStats.moveSpeed,
    obstacles: () => {
      const obstacles = mapPortals().flatMap(portal => portal
        ? [{ x: portal.x, y: portal.y - portal.height * .32, r: Math.max(60, portal.width * .6) + player.r + 24 }] : []);
      const boss = proceduralBoss.boss() ?? bossStateForMap(bosses, currentMapId);
      if (boss && !boss.dead) obstacles.push({ x: boss.x, y: boss.y, r: boss.r + player.r + 40 });
      return obstacles;
    },
    priorityStorage: () => autoFarmStorage,
    ...autoFarmProgress,
    bossDefinition: () => proceduralBoss.boss() ? proceduralBoss.boss() : bossForMap(currentMapId),
    playerCombat: () => playerCombat,
    playerStats: () => playerStats,
  });
  const enemySimulation = createEnemySimulation(enemies, projectileStore.spawnEnemyShot, player, () => { return ({ width: 0, height: 0, zoom: 1 }); }, engageEnemy, (amount, source) => playerCombat.damagePlayer(amount, source),
    {
      currentMapId: () => currentMapId,
      serverNowMs: () => timeKeeper.miliseconds,
      localIdentity: () => identity,
      remotePlayers: () => [],
      remoteCombatStats: (identity) => { },
      playerMovementSpeed: playerStats.moveSpeed,
      playerAttackRange: () => weaponAttackRange(playerState.hand?.id, player.attackRange),
      spawnDamageNumber: undefined,
      remoteGhostsEnabled: () => false,
      spawnBurst: (x, y, color, count, speed) => { },
      pullAggro: enemy => true,
    },);
  const bossController = createBossController({
    bosses,
    hazards: bossHazards,
    player,
    sharedBoss: (kind) => personalBosses.state(BOSSES[kind].mapId),
    bossResult: (kind) => personalBosses.result(BOSSES[kind].mapId),
    localIdentity: () => identity,
    serverNowMs: () => timeKeeper.miliseconds,
    bossTargets: () => [{ id: identity, x: player.x, y: player.y }],
    running: () => true,
    currentMapId: () => currentMapId,
    portalCutsceneActive: () => false,
    portalCutscenes: {},
    spawnBurst: (x, y, color, count, speed) => { },
    damagePlayer: (amount) => playerCombat.damagePlayerFromBoss(amount),
    damageEnemies: (attack, amount, inside) => playerCombat.damageEnemiesFromBoss(attack, amount, inside),
    collideEnemies: boss => playerCombat.pushEnemiesFromBoss(boss),
  });
  const camera = createCamera();
  let playerController: ReturnType<typeof createPlayerController>;
  const mapController = createMapController({
    onTravelStarted: autoFarm.travelStarted,
    travelWanted: destination => autoFarm.headingTo(destination),
    onTravelRefused: destination => autoFarm.travelRefused(destination),
    markPortalCutsceneSeen: cutscene => { },
    mapConfig: MAP_CONFIG,
    getCurrentMapId: () => currentMapId,
    setCurrentMapId: mapId => { currentMapId = mapId; autoFarm.start(evenShares(Object.keys(ENEMY_BASE_VALUES))); },
    prepareMapAssets: async mapId => { },
    instantTravelReady: () => true,
    player,
    camera,
    viewport: () => ({ width: 0, height: 0 }),
    keys: { clear: () => { } },
    stopTouchMove: () => { },
    cutsceneOverlay: document.createElement('div'),
    resizeViewport: () => { },
    isDueling: () => false,
    running: () => true,
    localMapState: () => null,
    changeMap: (mapId, x, y) => { console.log(`Ah damn it, changeMap fired with mapId:${mapId}, x:${x}, y:${y}`); return false; },
    syncStoppedPosition: () => { },
    resetPresentationState: () => { },
    fadeToWorld: (action) => { },
    mapUnlocked: (mapId) => mapId === TUTORIAL_FOREST_MAP_ID ? true : simulationState.bossKills[convertFromMapIndex(convertToMapIndex(mapId) - 1) ?? TUTORIAL_FOREST_MAP_ID] !== undefined,
    syncMapMusic: () => { },
    rebuildWorld: () => playerController.rebuildWorld(),
    spawnFromSite,
    enemies,
    spawnSites,
    clearTransientCombat: projectileStore.clear,
    bosses,
    bossHazards,
    onCutsceneFinished: () => { },
    onServerMove: (from, to) => false,
  });
  playerController = createPlayerController({
    player,
    boss: bosses.dragon,
    enemies: enemies,
    spawnSites,
    decor: [],
    paths: [],
    clearTransientCombat: projectileStore.clear,
    getCurrentMapId: () => currentMapId,
    mapSpawn: mapId => mapId === TUTORIAL_FOREST_MAP_ID ? bootstrap.startSpawn : bootstrap.mapConfig[mapId].arrival,
    initialStats: { maxHp: PLAYER_BASE_HP, damage: PLAYER_BASE_DAMAGE, attackRate: DEFAULT_ATTACK_INTERVAL, projectileSpeed: BASE_PROJECTILE_SPEED, projectileCount: 1, attackRange: BASE_ATTACK_RANGE, armor: 0, regen: PLAYER_BASE_REGEN, speed: PLAYER_SPEED, },
    invalidateStaticWorld: () => { },
    spawnFromSite,
    clearPlayerCombat: playerCombat.clearPendingThrow,
    resetBosses: bossController.resetAll,
    onResetUI: () => { },
    movement: dt => autoFarm.movement({ x: 0, y: 0, source: "none" }, dt),
    isMapTransitioning: mapController.isMapTransitioning,
    resolvePortalCollision: mapController.resolvePortalCollision,
    resolveBossCollision: () => bossController.forMap(currentMapId)?.resolveCollision(),
    applyBossKnockback: dt => bossController.applyBossKnockback(dt),
    viewport: () => ({ width: 0, height: 0, zoom: 1 }),
    cameraPosition: () => camera,
    isConnected: () => true,
    syncSpeed: speed => { },
    movementSpeedMultiplier: playerStats.movementMultiplier,
    regenerationPerSecond: playerStats.regenerationPerSecond,
    healthMultiplierBonus: playerStats.healthMultiplierBonus,
    syncMovementState: (x, y, vx, vy, inputSource, force, interestArea) => { },
    autoAttack: () => playerCombat.attackNearest(autoFarm.attackType(), autoFarm.targetCamp(), "strongest"),
    isAutoAttackEnabled: () => isWeaponItem(playerState.hand?.id),
    activeDuel: () => null,
    isDueling: () => false,
    localIdentity: () => identity,
    localState: () => null,
    syncLiveDuelDamage: duel => ({ state: { challengerHp: 0, opponentHp: 0 } }),
    liveDuelScene: () => null,
    setHeldDuelScene: scene => { },
    pulseDuel: () => { },
    resetLiveDuelPresentation: () => { },
    loadDuelReplay: async (id) => null,
    showDuelResult: replay => { },
    showDuelResultUnavailable: () => { },
  });

  function dumpSimulationState() {
    console.log(timeKeeper, simulationState, player, enemies);
    console.log(enemies[0]);
    const simulationTime = performance.now() - simulationState.startTime;
    const simulationRate = timeKeeper.miliseconds / simulationTime;
    console.log(simulationRate);
    console.log(personalBosses.state(currentMapId));
  }

  let lastSleep = performance.now();
  const sleepInterval = 100;
  const dt = 1000 / 60;
  let lastStatusUpdate = performance.now();
  const statusInterval = 1000;
  mapController.loadMap(currentMapId, player.x, player.y);
  autoFarm.start(evenShares(Object.keys(ENEMY_BASE_VALUES)));
  while (running) {
    if (performance.now() > lastSleep + sleepInterval) {
      await new Promise(r => setTimeout(r, 50));
      lastSleep = performance.now();
      if (performance.now() > lastStatusUpdate + statusInterval) {
        dumpSimulationState();
        console.log(Math.min(...enemies.map(e => Math.hypot(player.x - e.x, player.y - e.y))));
        lastStatusUpdate = performance.now();
      }
    }
    tick(timeKeeper, dt);
    playerController.update(dt / 1000);
    mapController.updatePortal(dt / 1000);
    personalBosses.update(dt / 1000);
    proceduralBoss.update(dt / 1000);
    enemySimulation.update(dt / 1000);
    bossController.forMap(currentMapId)?.update(dt / 1000);
    playerCombat.updateProjectiles(dt / 1000);
    updateRespawns(timeKeeper.miliseconds);
  }

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

function createPlayerStatsRuntime(playerState: PlayerState, tailwind: () => number | undefined) {
  function moveSpeed() {
    const research = PLAYER_SPEED * movementSpeedMultiplier(playerState.research.moveSpeed) + utilityMovementSpeedBonus(playerState.research.utilityMoveSpeed);
    const bonus = 1 + prestigePerkValue(playerState.prestigePerks, "fleetFoot") + Math.max(0, cardValue(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon]), "fleetFoot")) / 100
    const flat = blackBootsSpeed(playerState.feet?.id ?? "");
    const gear = gearMoveSpeedFactor(playerState.head?.id ?? "", playerState.chest?.id ?? "", playerState.feet?.id ?? "", playerState.feet?.level);
    return (research * bonus + flat) * gear * (1 + (tailwind() ?? 0));
  }
  return {
    healthMultiplierBonus: () => {
      const gearBonus = itemMaxHealthMultiplierBonus(playerState.chest?.id, playerState.slotUpgrades.chest);
      const researchBonus = researchStatFactors(playerState.research).maxHp;
      const cardBonus = cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])).maxHp;
      return gearBonus * researchBonus * cardBonus - 1;
    },
    regenerationPerSecond: () => {
      const gearBonus = itemRegenerationMultiplierBonus(playerState.head?.id, playerState.slotUpgrades.head);
      const researchBonus = researchStatFactors(playerState.research).regen;
      const cardBonus = cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])).regen;
      return gearBonus * researchBonus * cardBonus - 1;
    },
    moveSpeed,
    movementMultiplier: () => moveSpeed() / PLAYER_SPEED,
  }
}

function calcAttackSpeedCap(playerState: PlayerState) {
  const baseCap = playerAttackCap({ active: false, completed: playerState.reflectCompletions }, playerState.prestigePerks);
  const cardCap = cardStatFactors(cardTotals([...playerState.cards.armor, ...playerState.cards.helmet, ...playerState.cards.weapon])).attackCapRaise;
  baseCap.raise += cardCap;
  return baseCap;
}

function createAutoFarmStorage(playerState: PlayerState) {
  const storage = new Map<string, string>();
  Object.entries(playerState.autoFarmSettings).forEach(([key, value]) => storage.set(key, value));
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  }
}

export function convertToMapIndex(mapId: MapId) {
  const index = CAMPAIGN_MAPS.findIndex(m => m.id === mapId);
  return index !== -1 ? index : parseInt(mapId.split('_')[1]) + 14;
}

export function convertFromMapIndex(index: number): MapId | undefined {
  return index < 0 ? undefined : index < CAMPAIGN_MAPS.length ? CAMPAIGN_MAPS[index].id as MapId : `${PROCEDURAL_PREFIX}${index - 14}`;
}

function tick(timeKeeper: Time, dtMs: number) {
  timeKeeper.seconds += dtMs / 1000;
  timeKeeper.miliseconds += dtMs;
}
