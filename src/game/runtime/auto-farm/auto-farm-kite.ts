import { ENEMY_BASE_VALUES } from '../../../../shared/enemy-base-values';
import { armorDamageReduction } from '../../combat';
import { Movement } from '../player-input-controller';
import type { PlayerState, EnemyState, Position } from '../types';

const INFLUENCE_CONSTANT = 100;

export function smartMove(player: PlayerState, enemies: EnemyState[]): Position {
    const usableEnemies = enemies.filter(e => validEnemy(e));

    const followingEnemies = usableEnemies.filter(e => e.engaged);

    let dpsFollowing = 0;

    for (const enemy of followingEnemies) {
        dpsFollowing += enemyDps(enemy) * armorDamageReduction(player.armor);
    }
    console.log(dpsFollowing);

    if (dpsFollowing > player.regen || true) {
        console.log(`Running`);
        const position = { x: player.x, y: player.y };
        console.log(position);
        for (const enemy of enemies) {
            const influence = calculateInfluence(player, enemy);
            const vector = norm({ x: player.x - enemy.x, y: player.y - enemy.y });
            position.x += vector.x * influence;
            position.y += vector.y * influence;
        }
        console.log(position);
        return position;
    } else {
        console.log(`Pulling`);
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