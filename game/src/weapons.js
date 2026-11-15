// Weapon definitions and the view model: one hitscan family, each with its own damage,
// fire rate, magazine, reload, spread and recoil. main.js owns the ray; bots.js owns the
// bot trigger. Grenades are consumables handled here as definitions only.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 2, rate: 0.16, mag: 12, reserve: 48, reload: 1.4, spread: 0.006, moveSpread: 0.03, recoil: 0.011, auto: false, pellets: 1, range: 45, length: 0.34 },
  sg12: { id: 'sg12', name: 'SG-12 Shotgun', price: 1200, damage: 11, headMult: 2, rate: 0.85, mag: 6, reserve: 24, reload: 2.6, spread: 0.05, moveSpread: 0.04, recoil: 0.05, auto: false, pellets: 8, range: 26, length: 0.6 },
  vk9: { id: 'vk9', name: 'VK-9 SMG', price: 1500, damage: 22, headMult: 2, rate: 0.075, mag: 30, reserve: 120, reload: 1.8, spread: 0.008, moveSpread: 0.032, recoil: 0.008, auto: true, pellets: 1, range: 38, length: 0.5 },
  ar77: { id: 'ar77', name: 'AR-77 Rifle', price: 2700, damage: 34, headMult: 3, rate: 0.1, mag: 30, reserve: 90, reload: 1.9, spread: 0.005, moveSpread: 0.028, recoil: 0.012, auto: true, pellets: 1, range: 70, length: 0.62 },
  lr90: { id: 'lr90', name: 'LR-90 Marksman', price: 4000, damage: 88, headMult: 4, rate: 1.1, mag: 5, reserve: 20, reload: 3.0, spread: 0.002, moveSpread: 0.03, recoil: 0.04, auto: false, pellets: 1, range: 90, length: 0.8 },
};

export const GRENADES = {
  he: { id: 'he', name: 'HE Grenade', price: 300, key: '4' },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 250, key: '5' },
  flash: { id: 'flash', name: 'Flash Grenade', price: 200, key: '6' },
};

export const BUY_ITEMS = [
  { kind: 'weapon', id: 'sg12', desc: '8 pellets · close range' },
  { kind: 'weapon', id: 'vk9', desc: 'Fast · 30 rounds · close-mid' },
  { kind: 'weapon', id: 'ar77', desc: 'All-round rifle · 30 rounds' },
  { kind: 'weapon', id: 'lr90', desc: 'One-shot headshot · 5 rounds' },
  { kind: 'grenade', id: 'he', desc: '90 damage in 6 m' },
  { kind: 'grenade', id: 'smoke', desc: 'Blocks sight for 12 s' },
  { kind: 'grenade', id: 'flash', desc: 'Blinds for 2 s' },
  { kind: 'armor', id: 'armor', desc: 'Kevlar · absorbs 50% damage' },
];

export function createWeaponView(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), accent);
  sight.position.set(0, 0.08, -0.05);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.22, -0.23, -0.55);
  model.scale.setScalar(0.7);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.22, -0.2, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 0, 6);
  flashLight.position.set(0.22, -0.18, -0.7);
  camera.add(flashLight);

  const state = { def: WEAPONS.p9, mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0 };

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    const aimZ = aiming ? -0.62 : -0.55;
    const aimX = aiming ? 0.0 : 0.22;
    const aimY = aiming ? -0.185 : -0.23;
    model.position.x += (aimX - model.position.x) * Math.min(1, dt * 16);
    model.position.y += (aimY - model.position.y) * Math.min(1, dt * 16);
    model.position.z = aimZ + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.rate;
      state.flash = 0.06;
      state.kick = 0.03 + state.def.recoil;
      state.bloom = Math.min(0.05, state.bloom + state.def.recoil * 0.55);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reload;
      return true;
    },
    equip(def) {
      state.def = def;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    spread(speed, aiming, crouching) {
      let s = state.def.spread + Math.min(1, speed / 5.2) * state.def.moveSpread + state.bloom;
      if (aiming) s *= 0.45;
      if (crouching) s *= 0.7;
      return s;
    },
  };
}
