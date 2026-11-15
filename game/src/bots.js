// Bots: 4 Vanguard teammates (attackers) and 5 Warden defenders. Each bot is a small
// state machine — hold, push, plant, defuse, rotate, investigate — walking a waypoint
// graph, with line-of-sight raycasts, burst fire whose accuracy scales with distance and
// target movement, strafing, peeking, reloading and reacting to gunfire. Bots visibly
// move, see and shoot back; the player is just one more combatant to them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { SITES, SPAWNS } from './world.js';

const BOT_SPEED = 3.6;
const BOT_RADIUS = 0.35;
const BOT_HEIGHT = 1.72;
const EYE = 1.5;
const REACT_MIN = 0.25;
const REACT_MAX = 0.6;
const BURST_MIN = 3;
const BURST_MAX = 5;

const NAMES_ATK = ['Ash', 'Bram', 'Cleo', 'Dara'];
const NAMES_DEF = ['Ember', 'Fenn', 'Gus', 'Hale', 'Ivo'];

function makeBotMesh(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'atk' ? PALETTE.accent : PALETTE.defender), roughness: 0.7, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.3, metalness: 0.5 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), suit);
  torso.position.y = 1.08;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), dark);
  head.position.y = 1.62;
  head.userData.part = 'head';
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), visor);
  visorMesh.position.set(0, 1.63, -0.14);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.2), dark);
  legL.position.set(-0.14, 0.34, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(torso, head, visorMesh, legL, legR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
    }
  });
  return { group, torso, head, legL, legR };
}

export function createBots(scene, world, mover, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 80;
  const losRay = new THREE.Raycaster();
  losRay.far = 80;
  const bots = [];
  const hitMeshes = [];
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpClosest = new THREE.Vector3();
  const tmpSmokeCenter = new THREE.Vector3();

  function spawnBot(team, index, name, spawn) {
    const mesh = makeBotMesh(team);
    mesh.group.position.set(spawn[0], 0, spawn[1]);
    scene.add(mesh.group);
    const weaponId = team === 'atk' ? (index === 0 ? 'ar77' : index === 3 ? 'vk9' : 'ar77') : (index === 4 ? 'vk9' : 'ar77');
    const bot = {
      team,
      index,
      name,
      isBot: true,
      mesh,
      position: mesh.group.position,
      velocity: new THREE.Vector3(),
      yaw: team === 'atk' ? -Math.PI / 2 : Math.PI / 2,
      health: 100,
      alive: true,
      weaponId,
      mag: WEAPONS[weaponId].mag,
      reloadLeft: 0,
      state: 'hold',
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      holdNode: -1,
      target: null,
      reactAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      strafeDir: 0,
      strafeTimer: 0,
      lastShotPos: null,
      plantProgress: 0,
      defuseProgress: 0,
      walkPhase: random() * Math.PI * 2,
      speed: BOT_SPEED * (0.92 + random() * 0.16),
      accuracy: 0.85 + random() * 0.3,
    };
    mesh.torso.userData.bot = bot;
    mesh.head.userData.bot = bot;
    hitMeshes.push(mesh.torso, mesh.head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) spawnBot('atk', i, NAMES_ATK[i], SPAWNS.atk[i + 1] || SPAWNS.atk[0]);
  for (let i = 0; i < 5; i += 1) spawnBot('def', i, NAMES_DEF[i], SPAWNS.def[i]);

  function resetRound(roundPlan) {
    for (const bot of bots) {
      const spawns = bot.team === 'atk' ? SPAWNS.atk : SPAWNS.def;
      const s = spawns[bot.index + 1] || spawns[0];
      bot.position.set(s[0], 0, s[1]);
      bot.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'atk' ? -Math.PI / 2 : Math.PI / 2;
      bot.health = 100;
      bot.alive = true;
      bot.mag = WEAPONS[bot.weaponId].mag;
      bot.reloadLeft = 0;
      bot.state = 'hold';
      bot.path = [];
      bot.target = null;
      bot.burstLeft = 0;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.mesh.group.visible = true;
      bot.mesh.group.rotation.set(0, bot.yaw, 0);
      bot.mesh.group.position.y = 0;
      if (bot.team === 'atk') {
        bot.state = 'push';
        bot.path = world.findPath(s[0], s[1], roundPlan.site.center.x, roundPlan.site.center.z);
        bot.pathIndex = 0;
      } else {
        // Defenders: two hold A, two hold B, one holds mid.
        const holds = bot.index < 2 ? SITES.A : bot.index < 4 ? SITES.B : { center: new THREE.Vector3(8, 0, 0) };
        const holdSpots = [
          [16, -16], [23, -12], [16, 16], [23, 12], [8, 0],
        ];
        const spot = holdSpots[bot.index];
        bot.holdNode = world.nearestNode(spot[0], spot[1]);
        bot.path = world.findPath(s[0], s[1], spot[0], spot[1]);
        bot.pathIndex = 0;
        bot.state = 'push';
        bot.holdSpot = holds;
      }
    }
  }

  function hasLOS(from, to, smokeClouds) {
    tmpEye.set(from.x, from.y + EYE, from.z);
    tmpTarget.set(to.x, to.y + EYE, to.z);
    tmpDir.subVectors(tmpTarget, tmpEye);
    const dist = tmpDir.length();
    if (dist > 70) return false;
    losRay.set(tmpEye, tmpDir.normalize());
    losRay.far = dist;
    const hit = losRay.intersectObjects(world.shootables, false)[0];
    if (hit) return false;
    for (const cloud of smokeClouds) {
      if (cloud.life <= 0 || !cloud.group.visible) continue;
      const c = cloud.group.position;
      // Segment-sphere test against the smoke ball (radius ~2.6).
      tmpTo.subVectors(c, tmpEye);
      const t = Math.max(0, Math.min(dist, tmpTo.dot(tmpDir)));
      tmpClosest.copy(tmpEye).addScaledVector(tmpDir, t);
      if (tmpClosest.distanceToSquared(tmpSmokeCenter.set(c.x, 1.2, c.z)) < 2.6 * 2.6) return false;
    }
    return true;
  }

  function nearestEnemy(bot, playerState, aliveBots) {
    let best = null;
    let bestD = Infinity;
    const candidates = [];
    if (playerState.alive && bot.team === 'def') candidates.push({ pos: playerState.position, isPlayer: true, ref: playerState });
    if (bot.team === 'atk') {
      for (const other of aliveBots) if (other.team === 'def' && other.alive) candidates.push({ pos: other.position, isPlayer: false, ref: other });
    } else {
      for (const other of aliveBots) if (other.team === 'atk' && other.alive) candidates.push({ pos: other.position, isPlayer: false, ref: other });
    }
    for (const c of candidates) {
      const d = bot.position.distanceTo(c.pos);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? { ...best, dist: bestD } : null;
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function followPath(bot, dt, speedMul = 1) {
    if (!bot.path.length || bot.pathIndex >= bot.path.length) return true;
    const node = bot.path[bot.pathIndex];
    const dx = node.x - bot.position.x;
    const dz = node.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const speed = bot.speed * speedMul;
    bot.velocity.x = (dx / dist) * speed;
    bot.velocity.z = (dz / dist) * speed;
    faceToward(bot, node.x, node.z, dt, 8);
    mover.move(bot.position, bot.velocity, dt, BOT_RADIUS, BOT_HEIGHT);
    return false;
  }

  function step(bot, dt, time, ctx) {
    if (!bot.alive) return;
    const { playerState, smokeClouds, onBotShot, onBotDeath, bomb, roundPlan } = ctx;
    bot.strafeTimer -= dt;
    bot.pauseTimer -= dt;
    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= dt;
      if (bot.reloadLeft <= 0) bot.mag = WEAPONS[bot.weaponId].mag;
    }

    // Combat scan: nearest enemy with line of sight.
    const enemy = nearestEnemy(bot, playerState, bots);
    let inCombat = false;
    if (enemy && enemy.dist < 55) {
      if (hasLOS(bot.position, enemy.pos, smokeClouds)) {
        if (!bot.target) bot.reactAt = time + REACT_MIN + random() * (REACT_MAX - REACT_MIN);
        bot.target = enemy;
        if (time >= bot.reactAt) inCombat = true;
      } else if (bot.target === enemy) {
        bot.target = null;
      }
    } else if (bot.target) {
      bot.target = null;
    }

    // Objective overrides.
    if (bomb.state === 'planted' && bot.team === 'def' && bot.alive) {
      // Nearest alive defender defuses; others hold angles near the site.
      const aliveDefs = bots.filter((b) => b.team === 'def' && b.alive);
      const nearest = aliveDefs.reduce((a, b) => (a.position.distanceTo(bomb.pos) < b.position.distanceTo(bomb.pos) ? a : b), aliveDefs[0]);
      if (bot === nearest) {
        const d = bot.position.distanceTo(bomb.pos);
        if (d < 1.6) {
          bot.state = 'defuse';
          bot.defuseProgress += dt;
          if (bot.defuseProgress >= 5) {
            ctx.onDefused(bot);
            return;
          }
        } else if (bot.state !== 'rotate' || bot.pathIndex >= bot.path.length) {
          bot.state = 'rotate';
          bot.path = world.findPath(bot.position.x, bot.position.z, bomb.pos.x, bomb.pos.z);
          bot.pathIndex = 0;
        }
      }
    } else if (bomb.state === 'planted' && bot.team === 'atk') {
      // Attackers fall back to guard the planted charge from mid-range.
      if (bot.state !== 'hold' || !bot.holdSpot) {
        bot.state = 'hold';
        bot.holdSpot = { center: bot.position.clone() };
        bot.holdUntil = time + 999;
      }
    }

    if (inCombat && bot.target) {
      const t = bot.target;
      faceToward(bot, t.pos.x, t.pos.z, dt, 7);
      // Strafe sideways while fighting.
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.4 + random() * 0.7;
      }
      const side = bot.strafeDir;
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      bot.velocity.x = -fz * side * 1.6;
      bot.velocity.z = fx * side * 1.6;
      mover.move(bot.position, bot.velocity, dt, BOT_RADIUS, BOT_HEIGHT);
      // Burst fire.
      if (bot.reloadLeft <= 0) {
        if (bot.burstLeft > 0) {
          bot.burstTimer -= dt;
          if (bot.burstTimer <= 0) {
            bot.burstTimer = WEAPONS[bot.weaponId].rate;
            bot.burstLeft -= 1;
            if (bot.mag > 0) {
              bot.mag -= 1;
              onBotShot(bot, t, bot.weaponId);
            }
            if (bot.mag === 0) bot.reloadLeft = WEAPONS[bot.weaponId].reload;
          }
        } else if (bot.pauseTimer <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
          bot.pauseTimer = 0.7 + random() * 0.6;
          bot.burstTimer = 0;
        }
      }
    } else if (bot.state === 'push') {
      const done = followPath(bot, dt);
      if (done) {
        if (bot.team === 'atk' && bomb.state === 'carried' && bomb.carrier === bot) {
          bot.state = 'plant';
          bot.plantProgress = 0;
        } else {
          bot.state = 'hold';
          bot.holdUntil = time + 4 + random() * 4;
        }
      }
    } else if (bot.state === 'rotate') {
      const done = followPath(bot, dt, 1.1);
      if (done) bot.state = 'hold';
    } else if (bot.state === 'plant') {
      bot.plantProgress += dt;
      ctx.onPlantTick(bot, bot.plantProgress);
      if (bot.plantProgress >= 3.5) {
        ctx.onPlanted(bot);
        bot.state = 'hold';
      }
    } else if (bot.state === 'defuse') {
      // Channeling: stand still, face the charge.
      faceToward(bot, bomb.pos.x, bomb.pos.z, dt, 6);
    } else if (bot.state === 'hold') {
      bot.velocity.set(0, 0, 0);
      // Slow scan sweep while holding.
      bot.yaw += Math.sin(time * 0.5 + bot.index) * dt * 0.35;
      if (time > bot.holdUntil && bot.team === 'atk' && bomb.state === 'carried') {
        // Carrier bot that stalled re-pushes to the site.
        bot.state = 'push';
        bot.path = world.findPath(bot.position.x, bot.position.z, roundPlan.site.center.x, roundPlan.site.center.z);
        bot.pathIndex = 0;
      }
    }

    // Walk animation: legs swing, group faces yaw.
    const moving = Math.hypot(bot.velocity.x, bot.velocity.z) > 0.4;
    if (moving) bot.walkPhase += dt * 9;
    const swing = moving ? Math.sin(bot.walkPhase) * 0.5 : 0;
    bot.mesh.legL.rotation.x = swing;
    bot.mesh.legR.rotation.x = -swing;
    bot.mesh.group.rotation.y = bot.yaw;
    bot.mesh.group.position.y = moving ? Math.abs(Math.sin(bot.walkPhase)) * 0.04 : 0;
  }

  function damage(bot, amount, attackerName, isHeadshot, onKill) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.target = null;
    bot.mesh.group.rotation.x = -Math.PI / 2;
    bot.mesh.group.position.y = 0.15;
    onKill(bot, attackerName, isHeadshot);
    return true;
  }

  function hearShot(pos) {
    // Bots near a gunshot investigate it.
    for (const bot of bots) {
      if (!bot.alive || bot.target) continue;
      if (bot.position.distanceTo(pos) < 26 && bot.state === 'hold') {
        bot.state = 'push';
        bot.path = world.findPath(bot.position.x, bot.position.z, pos.x, pos.z);
        bot.pathIndex = 0;
      }
    }
  }

  return {
    bots,
    hitMeshes,
    resetRound,
    hasLOS,
    stepAll(dt, time, ctx) {
      for (const bot of bots) step(bot, dt, time, ctx);
    },
    damage,
    hearShot,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.team === 'atk' && b.alive && b.state === 'plant') || bots.find((b) => b.team === 'atk' && b.alive);
    },
  };
}
