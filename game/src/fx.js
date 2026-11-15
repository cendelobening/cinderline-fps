// Transient visual effects: tracers, impact puffs, smoke clouds, the planted charge and
// screen shake. All pools are reused, nothing is allocated in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 10;
const MAX_SMOKE = 8;

export function createFx(scene, camera) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.lamp), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 24 * 3), 3));
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.lamp), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const sparkVels = new Float32Array(MAX_SPARKS * 24 * 3);
  for (let i = 0; i < MAX_SPARKS; i += 1) sparks.push({ pos: new THREE.Vector3(), life: 0 });
  let sparkCursor = 0;

  // Smoke: soft billboards from a radial-gradient canvas texture.
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = 128;
  smokeCanvas.height = 128;
  const sctx = smokeCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(200,200,200,0.55)');
  grad.addColorStop(1, 'rgba(200,200,200,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const smokeTex = new THREE.CanvasTexture(smokeCanvas);
  const smokeClouds = [];
  for (let i = 0; i < MAX_SMOKE; i += 1) {
    const group = new THREE.Group();
    for (let j = 0; j < 7; j += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.5, depthWrite: false }));
      sprite.position.set((Math.random() - 0.5) * 3, 0.4 + Math.random() * 1.4, (Math.random() - 0.5) * 3);
      const scale = 2.2 + Math.random() * 1.6;
      sprite.scale.set(scale, scale, 1);
      group.add(sprite);
    }
    group.visible = false;
    scene.add(group);
    smokeClouds.push({ group, life: 0, maxLife: 12 });
  }
  let smokeCursor = 0;

  // The planted charge: small box with a blinking light.
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.4 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30') }),
  );
  bombLight.position.set(0.18, 0.2, 0);
  bombGroup.add(bombBody, bombLight);
  bombGroup.visible = false;
  scene.add(bombGroup);

  let shake = 0;
  const shakeOffset = new THREE.Vector3();

  function addTracer(from, to) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.09;
  }

  function addSparks(pos, normal) {
    const idx = sparkCursor;
    sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
    const s = sparks[idx];
    s.pos.copy(pos);
    s.life = 0.4;
    const base = idx * 24 * 3;
    const attr = sparkGeo.getAttribute('position');
    for (let i = 0; i < 24; i += 1) {
      attr.setXYZ(idx * 24 + i, pos.x, pos.y, pos.z);
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const speed = 1.5 + Math.random() * 3;
      sparkVels[base + i * 3] = Math.cos(a) * Math.cos(b) * speed + normal.x * 2;
      sparkVels[base + i * 3 + 1] = Math.sin(b) * speed + 1.5;
      sparkVels[base + i * 3 + 2] = Math.sin(a) * Math.cos(b) * speed + normal.z * 2;
    }
    attr.needsUpdate = true;
  }

  return {
    addTracer,
    addSparks,
    addSmoke(pos, duration = 12) {
      const cloud = smokeClouds[smokeCursor];
      smokeCursor = (smokeCursor + 1) % MAX_SMOKE;
      cloud.group.position.copy(pos);
      cloud.group.position.y = 0;
      cloud.life = duration;
      cloud.maxLife = duration;
      cloud.group.visible = true;
      return cloud;
    },
    smokeClouds,
    showBomb(pos) {
      bombGroup.position.copy(pos);
      bombGroup.position.y = 0.2;
      bombGroup.visible = true;
    },
    hideBomb() { bombGroup.visible = false; },
    setBombBlink(on) { bombLight.visible = on; },
    addShake(amount) { shake = Math.min(0.5, shake + amount); },
    step(dt, time) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
      let anySpark = false;
      const attr = sparkGeo.getAttribute('position');
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (sparks[i].life <= 0) continue;
        sparks[i].life -= dt;
        if (sparks[i].life > 0) {
          anySpark = true;
          const base = i * 24 * 3;
          for (let j = 0; j < 24; j += 1) {
            const idx = base + j * 3;
            sparkVels[idx + 1] -= 6 * dt;
            attr.array[idx] += sparkVels[idx] * dt;
            attr.array[idx + 1] += sparkVels[idx + 1] * dt;
            attr.array[idx + 2] += sparkVels[idx + 2] * dt;
          }
        }
      }
      sparkMat.opacity = anySpark ? 0.95 : 0;
      attr.needsUpdate = true;
      for (const cloud of smokeClouds) {
        if (cloud.life <= 0) {
          cloud.group.visible = false;
          continue;
        }
        cloud.life -= dt;
        const fade = Math.min(1, cloud.life / 2);
        for (const sprite of cloud.group.children) sprite.material.opacity = 0.5 * fade;
        cloud.group.rotation.y += dt * 0.1;
      }
      bombLight.visible = bombGroup.visible ? (time % 0.5) < 0.3 : false;
      if (shake > 0) {
        shake = Math.max(0, shake - dt * 1.6);
        shakeOffset.set((Math.random() - 0.5) * shake * 0.12, (Math.random() - 0.5) * shake * 0.12, 0);
        camera.position.add(shakeOffset);
      }
    },
  };
}
