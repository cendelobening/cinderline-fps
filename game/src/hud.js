// The DOM HUD: health, armor, money, ammo, timer, score, alive counts, bomb status,
// killfeed, hitmarker, damage vignette, crosshair spread, banners, plant prompt and the
// buy menu. It never touches the simulation; main.js pushes numbers in and reads the
// buy callbacks out.
import { BUY_ITEMS, WEAPONS, GRENADES } from './weapons.js';

const OVERLAY_COPY = {
  start: {
    title: 'CINDER<span class="accent">LINE</span>',
    copy: 'A round-based tactical FPS in a dusk rail yard. You are a <b>Vanguard</b> attacker with four bot teammates against five <b>Warden</b> defenders. Plant the charge at Foundry (A) or Depot (B), or wipe the enemy team. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'CINDER<span class="accent">LINE</span>',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  matchEnd: {
    title: 'MATCH OVER',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armorNum = $('armor-num');
  const moneyNum = $('money-num');
  const ammoEl = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeLine = $('grenade-line');
  const timerEl = $('timer');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const aliveAtk = $('alive-atk');
  const aliveDef = $('alive-def');
  const bombStatus = $('bomb-status');
  const roundLabel = $('round-label');
  const killfeed = $('killfeed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const vignette = $('vignette');
  const flashblind = $('flashblind');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const prompt = $('prompt');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const buyMenu = $('buy-menu');
  const buyGrid = $('buy-grid');
  const buyTimer = $('buy-timer');
  const buyMoney = $('buy-money');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function buildBuyMenu() {
    buyGrid.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'buy-item';
      let name = '';
      let price = 0;
      let desc = item.desc;
      if (item.kind === 'weapon') {
        name = WEAPONS[item.id].name;
        price = WEAPONS[item.id].price;
      } else if (item.kind === 'grenade') {
        name = GRENADES[item.id].name;
        price = GRENADES[item.id].price;
      } else {
        name = 'Kevlar Armor';
        price = 650;
      }
      btn.innerHTML = `<span>${name}<small>${desc}</small></span><span class="price">$${price}</span>`;
      btn.dataset.kind = item.kind;
      btn.dataset.id = item.id;
      btn.addEventListener('click', () => {
        if (buyHandler) buyHandler(item, btn);
      });
      buyGrid.appendChild(btn);
    }
  }
  buildBuyMenu();

  return {
    onPlay(handler) { play.addEventListener('click', handler); },
    onBuy(handler) { buyHandler = handler; },
    onBuyClose(handler) { $('buy-close').addEventListener('click', handler); },

    showOverlay(mode, extra) {
      const text = OVERLAY_COPY[mode];
      if (!text) return;
      title.innerHTML = text.title;
      copy.innerHTML = mode === 'matchEnd' ? extra : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },

    setHealth(hp, armor) {
      if (last.hp === hp && last.armor === armor) return;
      last.hp = hp;
      last.armor = armor;
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      healthNum.classList.toggle('low', hp <= 30);
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
      armorNum.textContent = String(armor);
    },
    setMoney(money) {
      if (last.money === money) return;
      last.money = money;
      moneyNum.textContent = String(money);
      buyMoney.textContent = `$${money}`;
    },
    setAmmo(mag, reserve, weaponId, grenades, selectedGrenade) {
      if (last.mag === mag && last.reserve === reserve && last.weaponId === weaponId && last.grenades === JSON.stringify(grenades) && last.selGrenade === selectedGrenade) return;
      last.mag = mag;
      last.reserve = reserve;
      last.weaponId = weaponId;
      last.grenades = JSON.stringify(grenades);
      last.selGrenade = selectedGrenade;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoEl.classList.toggle('empty', mag === 0);
      weaponName.textContent = WEAPONS[weaponId].name.toUpperCase();
      const parts = [];
      for (const [id, def] of Object.entries(GRENADES)) {
        const n = grenades[id] || 0;
        parts.push(`${n > 0 ? '●' : '○'} ${def.key} ${def.name.replace(' Grenade', '')} x${n}`);
      }
      grenadeLine.innerHTML = parts.map((p, i) => (Object.keys(GRENADES)[i] === selectedGrenade ? `<b>${p}</b>` : p)).join(' &nbsp;·&nbsp; ');
    },
    setTimer(seconds, phase) {
      const text = fmtTime(seconds);
      if (last.timer === text && last.phase === phase) return;
      last.timer = text;
      last.phase = phase;
      timerEl.textContent = text;
      timerEl.classList.toggle('low', phase === 'live' && seconds <= 10);
      timerEl.classList.toggle('buy', phase === 'buy');
    },
    setScore(atk, def, round) {
      if (last.scoreAtk === atk && last.scoreDef === def && last.round === round) return;
      last.scoreAtk = atk;
      last.scoreDef = def;
      last.round = round;
      scoreAtk.textContent = String(atk);
      scoreDef.textContent = String(def);
      roundLabel.textContent = `Round ${round} — first to 5`;
    },
    setAlive(atk, def) {
      if (last.aliveAtk === atk && last.aliveDef === def) return;
      last.aliveAtk = atk;
      last.aliveDef = def;
      aliveAtk.textContent = `${atk} alive`;
      aliveDef.textContent = `${def} alive`;
    },
    setBombStatus(text) {
      if (last.bomb === text) return;
      last.bomb = text;
      bombStatus.textContent = text;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), holdMs);
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--spread', `${px}px`);
      crosshair.style.transform = `translate(-50%, -50%) scale(${1 + px / 40})`;
    },
    damageFlash(strength) {
      vignette.style.opacity = String(Math.min(1, strength));
      setTimeout(() => { vignette.style.opacity = '0'; }, 260);
    },
    flashBlind(strength, ms) {
      flashblind.style.opacity = String(Math.min(1, strength));
      setTimeout(() => { flashblind.style.opacity = '0'; }, ms);
    },
    killfeedAdd(killer, victim, headshot, killerTeam, victimTeam) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="${killerTeam}">${killer}</span> ${headshot ? '<span class="hs">⌖</span> ' : ''}▸ <span class="${victimTeam}">${victim}</span>`;
      killfeed.prepend(div);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    banner(text, sub, win, holdMs = 3200) {
      bannerTitle.textContent = text;
      bannerTitle.className = win === true ? 'win' : win === false ? 'lose' : '';
      bannerSub.textContent = sub || '';
      banner.hidden = false;
      banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('show'), holdMs);
    },
    hideBanner() {
      banner.classList.remove('show');
      banner.hidden = true;
    },
    setPrompt(text) {
      if (text) {
        prompt.textContent = text;
        prompt.hidden = false;
      } else {
        prompt.hidden = true;
      }
    },
    setPlantProgress(ratio, show) {
      plantBar.hidden = !show;
      if (show) plantFill.style.width = `${Math.round(ratio * 100)}%`;
    },
    showBuy(seconds) {
      buyMenu.hidden = false;
      buyTimer.textContent = String(Math.ceil(seconds));
    },
    hideBuy() { buyMenu.hidden = true; },
    setBuyTimer(seconds) { buyTimer.textContent = String(Math.ceil(seconds)); },
    refreshBuy(money, primary, grenades, hasArmor) {
      buyMoney.textContent = `$${money}`;
      for (const btn of buyGrid.children) {
        const kind = btn.dataset.kind;
        const id = btn.dataset.id;
        let price = 0;
        if (kind === 'weapon') price = WEAPONS[id].price;
        else if (kind === 'grenade') price = GRENADES[id].price;
        else price = 650;
        btn.disabled = money < price || (kind === 'weapon' && primary === id) || (kind === 'armor' && hasArmor);
        btn.classList.toggle('owned', kind === 'weapon' && primary === id);
      }
    },
  };
}
