// Cinderline Yard: an industrial rail yard at dusk, ~64 x 44 m. Two bomb sites (A Foundry
// north-east, B Depot south-east), T spawn west, CT spawn east, a mid connector, the long
// Rail Line sightline north, and crates/containers as cover. Every box is a collider for
// movement and a surface bullets stop on; the collider list is the visual list, so what
// you see is what blocks you. Waypoints form the bot nav graph (BFS over the edges).
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Procedural canvas textures: corrugated steel, concrete and hazard stripes. No image files.
function makeTexture(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function steelTexture(base, stripe) {
  return makeTexture((ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 8) {
      ctx.fillStyle = (x / 8) % 2 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, 0, 4, s);
    }
    ctx.fillStyle = stripe;
    ctx.fillRect(0, s - 6, s, 6);
    for (let i = 0; i < 26; i += 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 6 + Math.random() * 14, 2);
    }
  });
}

function concreteTexture() {
  return makeTexture((ctx, s) => {
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i += 1) {
      const v = 40 + Math.random() * 40;
      ctx.fillStyle = `rgb(${v | 0},${(v + 4) | 0},${(v + 10) | 0})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  });
}

function hazardTexture() {
  return makeTexture((ctx, s) => {
    ctx.fillStyle = '#c8a02c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1c1e22';
    for (let x = -s; x < s * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  }, 64);
}

function textSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(18,20,26,0.72)';
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 150px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 134);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 2.4, 1);
  return sprite;
}

export const SITES = {
  A: { name: 'Foundry', center: new THREE.Vector3(23, 0, -15), radius: 5 },
  B: { name: 'Depot', center: new THREE.Vector3(23, 0, 15), radius: 5 },
};

export const SPAWNS = {
  atk: [
    [-28, -3], [-28, 0], [-28, 3], [-26, -5], [-26, 5],
  ],
  def: [
    [28, -3], [28, 0], [28, 3], [26, -5], [26, 5],
  ],
};

// Nav graph: [x, z] nodes and edges. Hand-built so no edge crosses a wall.
const NODES = [
  [-28, 0], [-24, -8], [-24, 8], [-16, -16], [-16, 0], [-16, 16],
  [-8, -16], [-8, 0], [-8, 16], [0, -8], [0, 8], [8, -16],
  [8, 0], [8, 16], [16, -16], [16, 0], [16, 16], [23, -15],
  [23, 15], [28, -8], [28, 8], [28, 0], [-24, -16], [-8, 8],
  [0, -16], [16, -8], [16, 8], [-24, 16],
];
const EDGES = [
  [0, 1], [0, 2], [0, 4], [1, 22], [1, 3], [2, 5], [2, 27], [3, 6], [3, 22],
  [4, 7], [4, 8], [5, 8], [5, 27], [6, 24], [6, 11], [7, 9], [7, 23], [7, 12],
  [8, 23], [8, 13], [9, 24], [9, 12], [10, 13], [10, 23], [11, 14], [11, 24],
  [12, 15], [12, 25], [13, 16], [13, 26], [14, 17], [14, 25], [15, 25], [15, 26],
  [16, 18], [16, 26], [17, 19], [17, 14], [18, 20], [18, 16], [19, 21], [20, 21],
  [21, 15], [22, 3], [24, 11], [25, 14], [26, 16], [27, 5], [23, 10], [23, 12],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const steel = steelTexture('#4a525e', '#f07a2e');
  const rust = steelTexture('#5e4636', '#c8a02c');
  const concrete = concreteTexture();
  const hazard = hazardTexture();
  const mats = {
    floor: new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95, metalness: 0.02 }),
    wall: new THREE.MeshStandardMaterial({ map: steel, roughness: 0.85, metalness: 0.25 }),
    rust: new THREE.MeshStandardMaterial({ map: rust, roughness: 0.9, metalness: 0.15 }),
    crate: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b5a3a'), roughness: 0.9, metalness: 0.05 }),
    container: new THREE.MeshStandardMaterial({ map: rust, roughness: 0.8, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.9 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.8 }),
    lamp: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.lamp), emissive: new THREE.Color(PALETTE.lamp), emissiveIntensity: 1.6 }),
  };

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function cylinder(rTop, rBottom, h, x, y, z, mat, seg = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter (64 x 44 m).
  box(65.2, 0.4, 45.2, 0, -0.2, 0, 'floor');
  box(0.6, 5, 45.2, -32.3, 2.5, 0, 'wall');
  box(0.6, 5, 45.2, 32.3, 2.5, 0, 'wall');
  box(65.2, 5, 0.6, 0, 2.5, -22.3, 'wall');
  box(65.2, 5, 0.6, 0, 2.5, 22.3, 'wall');

  // Rail Line (north lane, z = -16): two steel rails running the full length.
  box(56, 0.14, 0.18, 0, 0.07, -17.4, 'dark', false);
  box(56, 0.14, 0.18, 0, 0.07, -14.6, 'dark', false);
  for (let x = -27; x <= 27; x += 2) box(0.3, 0.06, 3.4, x, 0.03, -16, 'dark', false);

  // Site A — Foundry (north-east): furnace block, chimney, hazard apron.
  box(7, 5, 4.5, 27.5, 2.5, -19, 'rust');
  cylinder(1.1, 1.4, 9, 29.5, 4.5, -19.5, 'dark');
  box(5, 3.4, 0.6, 18.5, 1.7, -19.5, 'wall');
  box(8, 0.24, 8, 23, 0.12, -15, 'hazard', false);
  // Site B — Depot (south-east): stacked containers.
  box(6, 2.6, 2.6, 26, 1.3, 12, 'container');
  box(6, 2.6, 2.6, 26, 3.9, 12, 'container');
  box(6, 2.6, 2.6, 26, 1.3, 17.5, 'container');
  box(6, 2.6, 2.6, 18, 1.3, 19, 'container');
  box(8, 0.24, 8, 23, 0.12, 15, 'hazard', false);

  // Mid silo and mid cover.
  cylinder(2.2, 2.2, 6.5, 0, 3.25, 0, 'rust', 18);
  box(1.3, 1.3, 1.3, -6, 0.65, 2.5, 'crate');
  box(1.3, 1.3, 1.3, -6, 1.95, 2.5, 'crate');
  box(1.3, 1.3, 1.3, 6, 0.65, -2.5, 'crate');
  box(1.3, 1.3, 1.3, -2.5, 0.65, 8, 'crate');
  box(1.3, 1.3, 1.3, 2.5, 0.65, -8, 'crate');

  // Lane cover: containers and crates.
  box(6, 2.6, 2.6, -16, 1.3, -12.5, 'container');
  box(1.3, 1.3, 1.3, -10, 0.65, -16, 'crate');
  box(1.3, 1.3, 1.3, 8, 0.65, -13, 'crate');
  box(1.3, 1.3, 1.3, 8, 1.95, -13, 'crate');
  box(6, 2.6, 2.6, -16, 1.3, 13.5, 'container');
  box(1.3, 1.3, 1.3, -10, 0.65, 16, 'crate');
  box(1.3, 1.3, 1.3, 10, 0.65, 13, 'crate');
  box(1.3, 1.3, 1.3, 10, 0.65, 19, 'crate');
  // Approach walls with gaps (never a full seal).
  box(0.6, 3, 8, -20, 1.5, -8, 'wall');
  box(0.6, 3, 8, -20, 1.5, 8, 'wall');
  box(0.6, 3, 8, 14, 1.5, -8, 'wall');
  box(0.6, 3, 8, 14, 1.5, 8, 'wall');
  // Spawn cover.
  box(2.4, 1.1, 1.2, -26, 0.55, -10, 'crate');
  box(2.4, 1.1, 1.2, 26, 0.55, 10, 'crate');

  // Site markers: floating A / B rings.
  for (const [key, site] of Object.entries(SITES)) {
    const marker = textSprite(key, key === 'A' ? PALETTE.accent : PALETTE.defender);
    marker.position.set(site.center.x, 4.6, site.center.z);
    group.add(marker);
  }

  // Dusk sky: gradient dome, fog, low warm sun, sodium lamps.
  const skyGeo = new THREE.SphereGeometry(120, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#2b3245') },
      mid: { value: new THREE.Color('#7a4a33') },
      bottom: { value: new THREE.Color('#1a1410') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(bottom, mid, smoothstep(-0.1, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(new THREE.Color('#241d1a'), 26, 78);
  scene.add(new THREE.HemisphereLight(new THREE.Color('#5a5f7a'), new THREE.Color('#241a12'), 0.85));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb27a'), 1.6);
  sun.position.set(-30, 18, -28);
  sun.target.position.set(10, 0, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const lampPositions = [[-24, -8], [-8, 8], [8, -8], [24, 0], [0, -16], [16, 16]];
  for (const [x, z] of lampPositions) {
    box(0.3, 4.2, 0.3, x, 2.1, z, 'dark');
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), mats.lamp);
    head.position.set(x, 4.3, z);
    group.add(head);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 22, 16, 1.8);
    light.position.set(x, 4.1, z);
    scene.add(light);
  }

  // Nav graph: nodes as Vector3, adjacency lists, BFS pathfinder.
  const nodes = NODES.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const adjacency = nodes.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
  function findPath(fromX, fromZ, toX, toZ) {
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    const prev = new Array(nodes.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const next of adjacency[cur]) {
        if (prev[next] === -1) {
          prev[next] = cur;
          queue.push(next);
        }
      }
    }
    if (prev[goal] === -1) return [nodes[goal].clone()];
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.unshift(nodes[cur].clone());
      cur = prev[cur];
    }
    path.push(nodes[goal].clone());
    return path;
  }

  return { colliders, shootables, group, nodes, findPath, nearestNode };
}

// Axis-aligned box movement solver shared by player and bots: move one axis at a time.
export function createMover(colliders) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, radius, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }
  return {
    overlaps,
    move(pos, vel, dt, radius, height) {
      const nextX = pos.x + vel.x * dt;
      if (!overlaps(nextX, pos.y, pos.z, radius, height, 0.04)) pos.x = nextX;
      else vel.x = 0;
      const nextZ = pos.z + vel.z * dt;
      if (!overlaps(pos.x, pos.y, nextZ, radius, height, 0.04)) pos.z = nextZ;
      else vel.z = 0;
      pos.y += vel.y * dt;
      let onGround = false;
      const hit = overlaps(pos.x, pos.y, pos.z, radius, height, 0);
      if (hit && vel.y <= 0) {
        pos.y = hit.max.y;
        vel.y = 0;
        onGround = true;
      } else if (hit) {
        pos.y = hit.min.y - height;
        vel.y = 0;
      }
      if (pos.y < 0) {
        pos.y = 0;
        vel.y = 0;
        onGround = true;
      }
      return onGround;
    },
  };
}
