// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|buy|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady. ?autoplay=1 runs a
// scripted demo round without pointer lock, for headless play-testing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, createMover, SITES, SPAWNS } from './world.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createWeaponView, WEAPONS, GRENADES } from './weapons.js';
import { createEconomy } from './economy.js';
import { createRounds, BUY_SECONDS, ROUND_SECONDS, PLANT_SECONDS, DETONATE_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const autoplay = params.get('autoplay') === '1';
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b3245');
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const mover = createMover(world.colliders);
const fx = createFx(scene, camera);
const audio = createAudio();
const hud = createHud();
const economy = createEconomy();
const rounds = createRounds(random);
const player = createPlayer(mover, SPAWNS.atk[1]);
const bots = createBots(scene, world, mover, random);
const weaponView = createWeaponView(camera);
const input = createInput(renderer.domElement, onLockChange, onKey);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpVec3 = new THREE.Vector3();
const muzzle = new THREE.Vector3();

const S = {
  time: 0,
  phaseTime: 0,
  paused: false,
  started: false,
  frozen: false,
  plant: { active: false, progress: 0, site: null, anchor: new THREE.Vector3() },
  defuse: { active: false, progress: 0 },
  grenades: [],
  selectedGrenade: 'he',
  slots: {
    primary: { def: WEAPONS.p9, mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve },
    sidearm: { def: WEAPONS.p9, mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve },
  },
  slot: 'primary',
  blindUntil: 0,
  blindAmount: 0,
  autoplayAim: 0,
  prevFiring: false,
};
window.__game = S;
S.bots = bots.bots;
S.rounds = rounds.state;

const body = player.state;
const bomb = rounds.state.bomb;

function currentSlot() {
  return S.slots[S.slot];
}

function applySlot() {
  const slot = currentSlot();
  weaponView.state.def = slot.def;
  weaponView.state.mag = slot.mag;
  weaponView.state.reserve = slot.reserve;
  weaponView.state.reloadLeft = 0;
  weaponView.state.cooldown = 0;
}

function saveSlot() {
  const slot = currentSlot();
  slot.mag = weaponView.state.mag;
  slot.reserve = weaponView.state.reserve;
}

function equipPrimary() {
  saveSlot();
  S.slot = 'primary';
  S.slots.primary = { def: WEAPONS[economy.state.primary], mag: WEAPONS[economy.state.primary].mag, reserve: WEAPONS[economy.state.primary].reserve };
  applySlot();
}

function onKey(code) {
  if (shot) return;
  if (code === 'KeyB') toggleBuy();
  if (code === 'KeyR' && weaponView.reload()) audio.reload();
  if (code === 'Digit1') { saveSlot(); S.slot = 'primary'; applySlot(); }
  if (code === 'Digit2') { saveSlot(); S.slot = 'sidearm'; applySlot(); }
  if (code === 'KeyQ') cycleGrenade();
  if (code === 'Digit4') selectGrenade('he');
  if (code === 'Digit5') selectGrenade('smoke');
  if (code === 'Digit6') selectGrenade('flash');
  if (code === 'KeyG') throwGrenade();
  if (code === 'KeyM') {
    S.muted = !S.muted;
    audio.setMuted(S.muted);
  }
}

function cycleGrenade() {
  const owned = Object.keys(GRENADES).filter((id) => economy.state.grenades[id] > 0);
  if (!owned.length) return;
  const idx = owned.indexOf(S.selectedGrenade);
  S.selectedGrenade = owned[(idx + 1) % owned.length];
}

function selectGrenade(id) {
  if (economy.state.grenades[id] > 0) S.selectedGrenade = id;
}

function toggleBuy() {
  if (rounds.state.phase !== 'buy') return;
  const menu = document.getElementById('buy-menu');
  if (menu.hidden) {
    hud.showBuy(BUY_SECONDS - rounds.state.phaseTime);
    input.releaseLock();
  } else {
    hud.hideBuy();
    input.requestLock();
  }
}

hud.onBuy((item, btn) => {
  const ok = economy.buy(item);
  if (!ok) {
    audio.denied();
    return;
  }
  audio.buy();
  if (item.kind === 'weapon') equipPrimary();
  if (item.kind === 'armor') body.armor = 100;
  hud.refreshBuy(economy.state.money, economy.state.primary, economy.state.grenades, economy.state.armor);
});

hud.onBuyClose(() => {
  hud.hideBuy();
  input.requestLock();
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'menu') {
    startMatch();
  } else if (rounds.state.phase === 'matchEnd') {
    startMatch();
  }
  S.paused = false;
  input.requestLock();
});

function onLockChange(locked) {
  if (shot || autoplay) return;
  if (locked) {
    S.started = true;
    hud.hideOverlay();
    S.paused = false;
  } else if (rounds.state.phase === 'live' || rounds.state.phase === 'buy') {
    S.paused = true;
    hud.showOverlay('paused');
  }
}

function startMatch() {
  economy.reset();
  rounds.startMatch();
  body.armor = 0;
  startRoundSetup();
}

function startRoundSetup() {
  economy.newRound();
  player.reset(SPAWNS.atk[1]);
  body.armor = economy.state.armor ? 100 : 0;
  S.slots.primary = { def: WEAPONS[economy.state.primary], mag: WEAPONS[economy.state.primary].mag, reserve: WEAPONS[economy.state.primary].reserve };
  S.slots.sidearm = { def: WEAPONS.p9, mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
  S.slot = 'primary';
  applySlot();
  bots.resetRound({ site: SITES[rounds.state.site] });
  fx.hideBomb();
  S.grenades = [];
  S.plant.active = false;
  S.plant.progress = 0;
  S.defuse.progress = 0;
  rounds.state.phaseTime = 0;
  hud.hideBanner();
  hud.setPrompt('');
  hud.setPlantProgress(0, false);
  hud.showBuy(BUY_SECONDS);
  hud.refreshBuy(economy.state.money, economy.state.primary, economy.state.grenades, economy.state.armor);
  hud.setBombStatus(`Plant at ${rounds.state.site} — ${SITES[rounds.state.site].name}`);
}

function endRoundFlow(winner, reason) {
  if (rounds.state.phase === 'roundEnd' || rounds.state.phase === 'matchEnd') return;
  const won = winner === 'atk';
  economy.awardRound(won);
  rounds.endRound(winner, reason);
  hud.hideBuy();
  input.releaseLock();
  const scoreText = `Vanguards ${rounds.state.scoreAtk} — ${rounds.state.scoreDef} Wardens`;
  if (rounds.state.phase === 'matchEnd') {
    hud.banner(won ? 'MATCH WON' : 'MATCH LOST', `${scoreText} · ${reason}`, won);
    if (won) audio.roundWin();
    else audio.roundLose();
    setTimeout(() => {
      hud.showOverlay('matchEnd', won
        ? `The Vanguards take the match <b>${rounds.state.scoreAtk}–${rounds.state.scoreDef}</b>. ${reason} You earned <b>$${economy.state.money}</b> and <b>${economy.state.kills}</b> eliminations.`
        : `The Wardens take the match <b>${rounds.state.scoreDef}–${rounds.state.scoreAtk}</b>. ${reason} You earned <b>$${economy.state.money}</b> and <b>${economy.state.kills}</b> eliminations.`);
    }, 1200);
  } else {
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', `${scoreText} · ${reason}`, won);
    if (won) audio.roundWin();
    else audio.roundLose();
  }
}

function checkRoundEnd() {
  const r = rounds.state;
  if (r.phase !== 'live') return;
  const atkAlive = bots.aliveCount('atk') + (body.alive ? 1 : 0);
  const defAlive = bots.aliveCount('def');
  if (bomb.state === 'planted') {
    if (r.phaseTime - bomb.plantedAt >= DETONATE_SECONDS) {
      detonate();
      return;
    }
    if (atkAlive === 0 && defAlive > 0) return; // bomb still ticks
    if (defAlive === 0) {
      endRoundFlow('atk', 'Defenders wiped — charge detonates');
      return;
    }
    return;
  }
  if (defAlive === 0) {
    endRoundFlow('atk', 'Enemy team eliminated');
    return;
  }
  if (atkAlive === 0) {
    endRoundFlow('def', 'Attackers eliminated');
    return;
  }
  if (r.phaseTime >= ROUND_SECONDS) {
    endRoundFlow('def', 'Time expired — no plant');
  }
}

function detonate() {
  fx.addSparks(bomb.pos, tmpVec.set(0, 1, 0));
  fx.addShake(0.5);
  audio.explosion();
  const pos = bomb.pos;
  // The blast kills everyone caught near the charge.
  for (const bot of bots.bots) {
    if (bot.alive && bot.position.distanceTo(pos) < 8) {
      bots.damage(bot, 500, 'Charge', false, () => {});
    }
  }
  if (body.alive && body.position.distanceTo(pos) < 8) damagePlayer(500, null);
  fx.hideBomb();
  endRoundFlow('atk', 'Charge detonated at site ' + bomb.site);
}

function damagePlayer(amount, fromPos) {
  if (!body.alive) return;
  let remaining = amount;
  if (body.armor > 0) {
    const absorbed = Math.min(body.armor, amount * 0.5);
    body.armor -= absorbed;
    remaining -= absorbed;
  }
  body.health -= remaining;
  hud.damageFlash(0.6);
  fx.addShake(0.25);
  if (fromPos) {
    // Face the vignette: shake toward the shooter.
    tmpVec2.subVectors(fromPos, body.position).normalize();
  }
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    if (bomb.carrier === 'player') {
      const carrier = bots.bots.find((b) => b.team === 'atk' && b.alive);
      if (carrier) {
        bomb.carrier = carrier;
        carrier.state = 'push';
        carrier.path = world.findPath(carrier.position.x, carrier.position.z, SITES[rounds.state.site].center.x, SITES[rounds.state.site].center.z);
        carrier.pathIndex = 0;
      } else {
        bomb.carrier = null;
      }
    }
  }
}

function onBotKill(bot, killerName, headshot) {
  const killerTeam = killerName === 'You' ? 'atk' : bot.team === 'atk' ? 'def' : 'atk';
  hud.killfeedAdd(killerName, bot.name, headshot, killerTeam, bot.team);
  if (killerName === 'You') {
    economy.awardKill();
    audio.kill();
  }
}

function shootPlayer() {
  const def = weaponView.state.def;
  if (!weaponView.takeRound()) {
    audio.dryFire();
    return;
  }
  weaponView.pullTrigger();
  audio.shot(def.id);
  bots.hearShot(body.position);
  camera.getWorldDirection(direction);
  const spread = weaponView.spread(player.groundSpeed(), body.aiming, body.crouching);
  for (let p = 0; p < def.pellets; p += 1) {
    tmpVec.copy(direction);
    tmpVec.x += (random() * 2 - 1) * spread;
    tmpVec.y += (random() * 2 - 1) * spread;
    tmpVec.z += (random() * 2 - 1) * spread;
    tmpVec.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, tmpVec);
    raycaster.far = def.range;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    tmpVec3.copy(camera.position).addScaledVector(tmpVec, def.range);
    const end = hit ? hit.point : tmpVec3;
    muzzle.copy(camera.position).addScaledVector(direction, 0.6);
    muzzle.y -= 0.16;
    fx.addTracer(muzzle, end);
    if (!hit) continue;
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const isHead = hit.object.userData.part === 'head';
      const dist = hit.distance;
      const falloff = dist > 50 ? 0.6 : dist > 30 ? 0.8 : 1;
      const dmg = def.damage * (isHead ? def.headMult : 1) * falloff;
      const killed = bots.damage(bot, dmg, 'You', isHead, onBotKill);
      hud.hitMarker(killed, shot ? 4000 : 90);
      if (isHead) audio.headshot();
      else audio.hit();
      fx.addSparks(hit.point, hit.face ? hit.face.normal : tmpVec2.set(0, 1, 0));
    } else {
      fx.addSparks(hit.point, hit.face ? hit.face.normal : tmpVec2.set(0, 1, 0));
    }
  }
  player.recoil(def.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * def.recoil * 0.4);
}

function onBotShot(bot, target, weaponId) {
  const def = WEAPONS[weaponId];
  const dist = bot.position.distanceTo(target.pos);
  const targetSpeed = target.isPlayer ? player.groundSpeed() : Math.hypot(target.ref.velocity.x, target.ref.velocity.z);
  let p = 0.55 * bot.accuracy - dist * 0.007 - targetSpeed * 0.025;
  if (target.isPlayer && body.crouching) p -= 0.05;
  p = Math.max(0.05, Math.min(0.6, p));
  tmpVec.set(bot.position.x, bot.position.y + 1.3, bot.position.z);
  tmpVec2.copy(tmpVec).addScaledVector(tmpVec3.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw)), 0.5);
  if (random() < p) {
    const isHead = random() < 0.08;
    const falloff = dist > 50 ? 0.6 : dist > 30 ? 0.8 : 1;
    const dmg = def.damage * (isHead ? def.headMult : 1) * falloff;
    tmpVec3.set(target.pos.x, target.pos.y + (isHead ? 1.6 : 1.1), target.pos.z);
    fx.addTracer(tmpVec2, tmpVec3);
    audio.enemyShot(dist);
    if (target.isPlayer) {
      damagePlayer(dmg, bot.position);
    } else {
      const killed = bots.damage(target.ref, dmg, bot.name, isHead, onBotKill);
      if (killed && target.ref === bomb.carrier) {
        // Carrier down: charge passes to another living Vanguard.
        const next = bots.bots.find((b) => b.team === 'atk' && b.alive);
        bomb.carrier = next || null;
        if (next) {
          next.state = 'push';
          next.path = world.findPath(next.position.x, next.position.z, SITES[rounds.state.site].center.x, SITES[rounds.state.site].center.z);
          next.pathIndex = 0;
        }
      }
    }
  } else {
    // Miss: tracer lands wide of the target.
    tmpVec3.set(
      target.pos.x + (random() - 0.5) * 2.5,
      target.pos.y + 0.6 + random() * 1.4,
      target.pos.z + (random() - 0.5) * 2.5,
    );
    fx.addTracer(tmpVec2, tmpVec3);
    audio.enemyShot(dist);
  }
}

function throwGrenade() {
  const id = S.selectedGrenade;
  if (economy.state.grenades[id] <= 0) {
    audio.denied();
    return;
  }
  economy.state.grenades[id] -= 1;
  audio.throwPin();
  camera.getWorldDirection(direction);
  S.grenades.push({
    kind: id,
    pos: new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z),
    vel: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.2, 0)),
    fuse: 1.4,
  });
}

function stepGrenades(dt) {
  for (let i = S.grenades.length - 1; i >= 0; i -= 1) {
    const g = S.grenades[i];
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.15) {
      g.pos.y = 0.15;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (Math.abs(g.pos.x) > 31.5) g.vel.x *= -0.5;
    if (Math.abs(g.pos.z) > 21.5) g.vel.z *= -0.5;
    g.fuse -= dt;
    if (g.fuse <= 0) {
      S.grenades.splice(i, 1);
      if (g.kind === 'he') {
        fx.addSparks(g.pos, tmpVec.set(0, 1, 0));
        fx.addShake(0.4);
        audio.explosion();
        for (const bot of bots.bots) {
          if (!bot.alive) continue;
          const d = bot.position.distanceTo(g.pos);
          if (d < 6) bots.damage(bot, 90 * (1 - d / 6) + 10, 'You', false, onBotKill);
        }
        if (body.alive && body.position.distanceTo(g.pos) < 6) damagePlayer(90 * (1 - body.position.distanceTo(g.pos) / 6) + 10, g.pos);
      } else if (g.kind === 'smoke') {
        fx.addSmoke(g.pos, 12);
      } else if (g.kind === 'flash') {
        const d = body.position.distanceTo(g.pos);
        if (d < 25) {
          camera.getWorldDirection(direction);
          tmpVec.subVectors(g.pos, camera.position).normalize();
          if (direction.dot(tmpVec) > 0.2) {
            S.blindUntil = S.time + 2;
            S.blindAmount = Math.max(0.3, 1 - d / 25);
            hud.flashBlind(S.blindAmount, 900);
          }
        }
        for (const bot of bots.bots) {
          if (!bot.alive) continue;
          const bd = bot.position.distanceTo(g.pos);
          if (bd < 20) {
            bot.target = null;
            bot.reactAt = S.time + 2;
          }
        }
        audio.explosion();
      }
    }
  }
}

function nearestSite(pos) {
  for (const key of ['A', 'B']) {
    if (pos.distanceTo(SITES[key].center) <= SITES[key].radius) return key;
  }
  return null;
}

function stepPlant(dt) {
  const r = rounds.state;
  if (r.phase !== 'live' || !body.alive || bomb.state !== 'carried' || bomb.carrier !== 'player') {
    S.plant.active = false;
    S.plant.progress = 0;
    hud.setPlantProgress(0, false);
    hud.setPrompt('');
    return;
  }
  const site = nearestSite(body.position);
  if (!site) {
    S.plant.progress = Math.max(0, S.plant.progress - dt * 2);
    hud.setPlantProgress(S.plant.progress / PLANT_SECONDS, S.plant.progress > 0);
    hud.setPrompt('Reach a site marker (A or B) to plant — hold E');
    return;
  }
  hud.setPrompt(`Hold E — planting at site ${site} (${SITES[site].name})`);
  const holding = input.state.keys.has('KeyE');
  if (holding) {
    if (!S.plant.active) {
      S.plant.active = true;
      S.plant.site = site;
      S.plant.anchor.copy(body.position);
    }
    if (body.position.distanceTo(S.plant.anchor) > 1.2) {
      S.plant.progress = Math.max(0, S.plant.progress - dt * 2);
    } else {
      S.plant.progress += dt;
      if (Math.floor(S.plant.progress * 4) !== Math.floor((S.plant.progress - dt) * 4)) audio.plantBeep(false);
    }
    hud.setPlantProgress(S.plant.progress / PLANT_SECONDS, true);
    if (S.plant.progress >= PLANT_SECONDS) {
      rounds.plantAt(site);
      economy.awardPlant();
      fx.showBomb(bomb.pos);
      audio.plantBeep(true);
      hud.banner('CHARGE PLANTED', `Detonation in ${DETONATE_SECONDS}s — defend site ${site}`, true);
      hud.setPlantProgress(0, false);
      S.plant.progress = 0;
      S.plant.active = false;
    }
  } else {
    S.plant.progress = Math.max(0, S.plant.progress - dt * 2);
    hud.setPlantProgress(S.plant.progress / PLANT_SECONDS, S.plant.progress > 0);
  }
}

function botCtx() {
  return {
    playerState: body,
    smokeClouds: fx.smokeClouds,
    bomb,
    roundPlan: { site: SITES[rounds.state.site] },
    onBotShot,
    onBotDeath: () => {},
    onPlantTick: (bot, progress) => {
      if (bot === bomb.carrier) hud.setPlantProgress(progress / PLANT_SECONDS, progress > 0.05);
    },
    onPlanted: (bot) => {
      rounds.plantAt(rounds.state.site);
      fx.showBomb(bomb.pos);
      audio.plantBeep(true);
      hud.banner('CHARGE PLANTED', `The charge is down at site ${rounds.state.site} — ${DETONATE_SECONDS}s to detonation`, false);
    },
    onDefused: (bot) => {
      fx.hideBomb();
      bomb.state = 'defused';
      endRoundFlow('def', `${bot.name} defused the charge`);
    },
  };
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function syncHud() {
  const r = rounds.state;
  hud.setHealth(body.health, Math.round(body.armor));
  hud.setMoney(economy.state.money);
  hud.setAmmo(weaponView.state.mag, weaponView.state.reserve, weaponView.state.def.id, economy.state.grenades, S.selectedGrenade);
  hud.setScore(r.scoreAtk, r.scoreDef, r.round);
  hud.setAlive(bots.aliveCount('atk') + (body.alive ? 1 : 0), bots.aliveCount('def'));
  if (r.phase === 'buy') hud.setTimer(BUY_SECONDS - r.phaseTime, 'buy');
  else if (r.phase === 'live') hud.setTimer(ROUND_SECONDS - r.phaseTime, 'live');
  else hud.setTimer(0, r.phase);
  if (bomb.state === 'planted') {
    hud.setBombStatus(`CHARGE LIVE — ${Math.max(0, Math.ceil(DETONATE_SECONDS - (r.phaseTime - bomb.plantedAt)))}s · site ${bomb.site}`);
  } else if (bomb.state === 'carried') {
    hud.setBombStatus(bomb.carrier === 'player' ? `You carry the charge — plant at ${r.site}` : `${bomb.carrier ? bomb.carrier.name : '—'} carries the charge`);
  } else {
    hud.setBombStatus('');
  }
  const spreadPx = weaponView.spread(player.groundSpeed(), body.aiming, body.crouching) * 900;
  hud.setCrosshairSpread(Math.min(26, 4 + spreadPx));
}

function autoplayStep(dt) {
  // Scripted demo: aim at the nearest visible enemy and fire; walk forward.
  // Only shoots during the live phase, like a real player.
  if (rounds.state.phase !== 'live') {
    input.state.keys.add('KeyW');
    return;
  }
  S.autoplayAim -= dt;
  let best = null;
  let bestD = Infinity;
  for (const bot of bots.bots) {
    if (bot.team !== 'def' || !bot.alive) continue;
    const d = bot.position.distanceTo(body.position);
    if (d < bestD && bots.hasLOS(body.position, bot.position, fx.smokeClouds)) {
      bestD = d;
      best = bot;
    }
  }
  if (best && S.autoplayAim <= 0) {
    S.autoplayAim = 0.25;
    if (weaponView.state.mag === 0) weaponView.reload();
    tmpVec.set(best.position.x, best.position.y + 1.2, best.position.z);
    const dx = tmpVec.x - body.position.x;
    const dy = tmpVec.y - (body.position.y + body.eye);
    const dz = tmpVec.z - body.position.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    body.yaw = Math.atan2(-dx, -dz);
    body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
    shootPlayer();
  }
  input.state.keys.add('KeyW');
}

function step(dt) {
  S.time += dt;
  const r = rounds.state;
  if (r.phase === 'buy' || r.phase === 'live') r.phaseTime += dt;
  else if (r.phase === 'roundEnd') r.phaseTime += dt;

  if (r.phase === 'buy' && r.phaseTime >= BUY_SECONDS) {
    hud.hideBuy();
    rounds.beginLive();
    if (!shot && !autoplay) input.requestLock();
  }
  if (r.phase === 'roundEnd' && r.phaseTime >= 4) {
    rounds.nextRound();
    startRoundSetup();
  }

  const frozen = S.paused || r.phase === 'menu' || r.phase === 'matchEnd' || r.phase === 'roundEnd' || !body.alive;
  if (autoplay) autoplayStep(dt);
  const look = input.takeLook();
  if (!S.paused && (input.state.locked || autoplay || shot)) player.look(look.x, look.y);
  const stepped = player.step(dt, input.state.keys, frozen);
  if (stepped) audio.footstep();
  weaponView.step(dt, body.aiming);

  if (r.phase === 'live') {
    bots.stepAll(dt, S.time, botCtx());
    stepPlant(dt);
    stepGrenades(dt);
    checkRoundEnd();
    if (input.state.firing && !S.prevFiring && !weaponView.state.def.auto) shootPlayer();
    else if (input.state.firing && weaponView.state.def.auto && weaponView.ready()) shootPlayer();
    if (input.state.keys.has('KeyR')) weaponView.reload();
  } else if (r.phase === 'buy') {
    stepGrenades(dt);
    hud.setBuyTimer(Math.max(0, BUY_SECONDS - r.phaseTime));
  }
  S.prevFiring = input.state.firing;
  fx.step(dt, S.time);
}

let accumulator = 0;
let lastTime = performance.now();
let frameCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!S.frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  frameCount += 1;
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      S.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  const plan = { site: SITES[rounds.state.site] };
  if (name === 'start') {
    rounds.state.phase = 'menu';
    player.reset(SPAWNS.atk[1]);
    bots.resetRound(plan);
    settle(10);
    aimAt(new THREE.Vector3(10, 2, -8));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    rounds.state.phase = 'buy';
    rounds.state.phaseTime = 6;
    player.reset(SPAWNS.atk[1]);
    bots.resetRound(plan);
    economy.state.money = 4700;
    settle(10);
    aimAt(new THREE.Vector3(8, 1.5, -6));
    hud.showBuy(9);
    hud.refreshBuy(4700, 'p9', economy.state.grenades, false);
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.phaseTime = 38;
    rounds.state.scoreAtk = 2;
    rounds.state.scoreDef = 1;
    rounds.state.round = 4;
    player.reset([2, 6]);
    body.health = 78;
    economy.state.money = 3200;
    economy.state.primary = 'ar77';
    S.slots.primary = { def: WEAPONS.ar77, mag: 24, reserve: 90 };
    S.slot = 'primary';
    applySlot();
    bots.resetRound(plan);
    // Stage a firefight: two Wardens visible down the Rail Line, one Vanguard beside us.
    const defs = bots.bots.filter((b) => b.team === 'def');
    defs[0].position.set(10, 0, -6);
    defs[1].position.set(14, 0, -12);
    defs[2].position.set(16, 0, 2);
    const atks = bots.bots.filter((b) => b.team === 'atk');
    atks[0].position.set(-7, 0, 11); // Vanguard behind-left, clear of the camera lane.
    atks[0].yaw = -Math.PI / 2;
    defs[0].yaw = Math.PI / 2;
    defs[1].yaw = Math.PI / 2;
    settle(6);
    // Kill one Warden on camera for the killfeed and a red hitmarker.
    aimAt(new THREE.Vector3(defs[0].position.x, 1.2, defs[0].position.z));
    bots.damage(defs[0], 200, 'You', true, onBotKill);
    hud.hitMarker(true, 60000);
    settle(4);
    aimAt(new THREE.Vector3(defs[1].position.x, 1.2, defs[1].position.z));
    shootPlayer();
    settle(4); // Let the 60 ms muzzle flash decay so the frame reads clean; tracer + hitmarker stay.
  } else if (name === 'end') {
    rounds.state.phase = 'roundEnd';
    rounds.state.phaseTime = 1;
    rounds.state.scoreAtk = 3;
    rounds.state.scoreDef = 1;
    rounds.state.round = 5;
    player.reset([16, -8]);
    economy.state.money = 6450;
    bots.resetRound(plan);
    const defs = bots.bots.filter((b) => b.team === 'def');
    for (const b of defs) {
      bots.damage(b, 500, 'You', false, onBotKill);
    }
    rounds.plantAt('A');
    fx.showBomb(bomb.pos);
    fx.addSmoke(new THREE.Vector3(23, 0, -15), 12);
    settle(6);
    aimAt(new THREE.Vector3(23, 1.5, -15));
    hud.banner('ROUND WON', 'Vanguards 3 — 1 Wardens · Enemy team eliminated', true, 60000);
  }
  syncHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
if (shot) runShot(shot);
else {
  if (autoplay) startMatch();
  requestAnimationFrame(frame);
}
