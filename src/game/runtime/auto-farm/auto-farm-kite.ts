import { ENEMY_BASE_VALUES } from '../../../../shared/enemy-base-values';
import { armorDamageReduction } from '../../combat';
import { RewardType } from '../../enemies';
import type { PlayerState, EnemyState, Position } from '../types';

const INFLUENCE_CONSTANT = 300000;

const mapSize = 5000;
const CENTER_PULL_STRENGTH = 10;
const CENTER_PULL_RADIUS = 2000;
const CENTER_PUSH_RADIUS = 500;

const BOSS_CORNER_SIZE = 800;
const BOSS_CORNER_BUFFER = 200;

const CLOSE_DPS_DISTANCE = 300;

const CLOSE_ENEMY_RANGE = 50;

let runningFromBoss = false;

export function smartMove(player: PlayerState, enemies: EnemyState[], mapId: string): Position {

    const boss = { x: 4000, y: 4000 };
    const bossCornerDist = Math.hypot(player.x - boss.x, player.y - boss.y);
    //console.log(bossCornerDist);
    if (bossCornerDist < BOSS_CORNER_SIZE + (runningFromBoss ? BOSS_CORNER_BUFFER : 0)) {
        console.log(`Running from boss (${player.x}, ${player.y})`);
        runningFromBoss = true;
        return { x: mapSize / 2, y: mapSize / 2 };
    } else {
        if (runningFromBoss) console.log(`Finished running`);
        runningFromBoss = false;
    }


    const usableEnemies = enemies.filter(e => validEnemy(e));

    const followingEnemies = usableEnemies.filter(e => e.engaged);

    let dpsFollowing = 0;

    for (const enemy of followingEnemies) {
        dpsFollowing += enemyDps(enemy) * armorDamageReduction(player.armor);
    }

    const closeEnemies = followingEnemies.filter(e => Math.hypot(player.x - e.x, player.y - e.y) < CLOSE_DPS_DISTANCE);

    let dpsClose = 0;

    for (const enemy of closeEnemies) {
        dpsClose += enemyDps(enemy) * armorDamageReduction(player.armor);
    }

    const timeTillDeath = player.hp / (dpsClose - player.regen);

    const totalTimeTillDeath = player.hp / (dpsFollowing - player.regen);

    console.log(timeTillDeath);

    const centreDist = Math.hypot(player.x - mapSize / 2, player.y - mapSize / 2);
    if (centreDist < CENTER_PUSH_RADIUS && centreDist > 0) {
        console.log(`Being pushed by centre`);
        return { x: mapSize / 2 + (player.x - mapSize / 2) * 5, y: mapSize / 2 + (player.y - mapSize / 2) * 5 };
    }

    if (timeTillDeath > 0 && timeTillDeath < 3) {
        console.log(`Running`);
        const position = { x: player.x, y: player.y };
        //console.log(position);
        if (centreDist > CENTER_PULL_RADIUS) {
            const vector = norm({ x: mapSize / 2 - player.x, y: mapSize / 2 - player.y });
            position.x += vector.x * CENTER_PULL_STRENGTH * centreDist;
            position.y += vector.y * CENTER_PULL_STRENGTH * centreDist;
        }
        for (const enemy of usableEnemies) {
            const influence = calculateInfluence(player, enemy) ** (enemy.engaged ? 1 : 4);
            const vector = norm({ x: player.x - enemy.x, y: player.y - enemy.y });
            position.x += vector.x * influence;
            position.y += vector.y * influence;
        }
        //console.log(position);
        //console.log(position);
        return moveAroundCentre(position, player);
    } else if (totalTimeTillDeath < 0 || totalTimeTillDeath > 10) {
        console.log(`Pulling`);
        /*let closestEnemy;
        let closestDistance = Infinity;
        for (const enemy of usableEnemies) {
            if (enemy.engaged) continue;
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (dist < closestDistance && (!closestEnemy || moreUsefull(enemy, closestEnemy))) {
                closestDistance = dist;
                closestEnemy = enemy;
            }
        }*/
        const closestEnemy = usableEnemies.filter(e => !e.engaged).map(e => { return { data: e, distance: Math.hypot(player.x - e.x, player.y - e.y) * (distanceBoost(e) + 1) }; }).sort((a, b) => a.distance - b.distance)[0].data;
        if (closestEnemy) {
            return moveAroundCentre({ x: closestEnemy.x, y: closestEnemy.y }, player);
        }
    } else {
        console.log(`Moving towards closest hunting target`);
        let closestEnemy;
        let closestDistance = Infinity;
        for (const enemy of followingEnemies) {
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (dist < closestDistance) {
                closestDistance = dist;
                closestEnemy = enemy;
            }
        }
        if (closestEnemy && closestDistance > CLOSE_ENEMY_RANGE) {
            return moveAroundCentre({ x: closestEnemy.x, y: closestEnemy.y }, player);
        }
    }
    return { x: player.x, y: player.y };
}

const validEnemy = (enemy: EnemyState) => !enemy.dead && !enemy.remoteCombatGhost && !enemy.generatedBoss && enemy.hp > 0;

function enemyDps(enemy: EnemyState): number {
    if (!enemy.definition) {
        //console.log(`Enemy found without definition: ${JSON.stringify(enemy)}`);
        //return 0;
        enemy.definition = ENEMY_BASE_VALUES[enemy.type];
    }
    return enemy.damage * enemy.definition.attackSpeed;
}

function calculateInfluence(player: PlayerState, enemy: EnemyState): number {
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    return INFLUENCE_CONSTANT / Math.pow(dist, 2);
}

function norm(v: Position): Position {
    const mag = Math.hypot(v.x, v.y);
    if (mag === 0) return v;
    return { x: v.x / mag, y: v.y / mag };
}

function moreUsefull(enemy0: EnemyState, enemy1: EnemyState): boolean {
    const priorities: Array<RewardType> = ["regen", "damage", "health", "armor", "speed", "crit"];
    return priorities.indexOf(enemy0.reward.type) <= priorities.indexOf(enemy1.reward.type);
}

function distanceBoost(enemy: EnemyState): number {
    const priorities: Array<RewardType> = ["regen", "health", "armor", "damage", "speed", "crit"];
    return priorities.indexOf(enemy.reward.type);
}

function pushOutOfCentre(position: Position): Position {
    const vector = { x: position.x - mapSize / 2, y: position.y - mapSize / 2 };
    if (Math.hypot(vector.x, vector.y) > CENTER_PUSH_RADIUS) {
        return position;
    }
    const normalizedVector = norm(vector);
    return { x: mapSize / 2 + normalizedVector.x * CENTER_PUSH_RADIUS, y: mapSize / 2 + normalizedVector.y * CENTER_PUSH_RADIUS };
}

function setMag(vector: Position, length: number): Position {
    const mag = Math.hypot(vector.x, vector.y);
    if (mag == 0) return vector;
    return { x: vector.x / mag * length, y: vector.y / mag * length };
}

function moveAroundCentre(position: Position, player: PlayerState): Position {
    const movementVector = sub(position, player);
    const pushedPos = pushOutOfCentre(add(player, setMag(movementVector, player.speed)));
    const delta = setMag({ x: pushedPos.x - player.x, y: pushedPos.y - player.y }, player.speed);
    return { x: player.x + delta.x, y: player.y + delta.y };
}

function add(pos0: Position | PlayerState | EnemyState, pos1: Position | PlayerState | EnemyState): Position {
    return { x: pos0.x + pos1.x, y: pos0.y + pos1.y };
}

function sub(pos0: Position | PlayerState | EnemyState, pos1: Position | PlayerState | EnemyState): Position {
    return { x: pos0.x - pos1.x, y: pos0.y - pos1.y };
}

