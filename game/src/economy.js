// The economy: start $800, kill +$300, round win +$3250, round loss +$1900 plus $500
// per consecutive loss up to +$2900, plant +$300. Buying replaces the current primary;
// grenades stack; kevlar is a one-round purchase (no carry-over between rounds).
import { WEAPONS, GRENADES } from './weapons.js';

export function createEconomy() {
  const state = {
    money: 800,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    plants: 0,
    primary: 'p9',
    grenades: { he: 0, smoke: 0, flash: 0 },
    armor: false,
  };

  function canAfford(price) {
    return state.money >= price;
  }

  return {
    state,
    reset() {
      state.money = 800;
      state.lossStreak = 0;
      state.kills = 0;
      state.deaths = 0;
      state.plants = 0;
      state.primary = 'p9';
      state.grenades = { he: 0, smoke: 0, flash: 0 };
      state.armor = false;
    },
    newRound() {
      state.armor = false; // kevlar lasts one round only
    },
    awardKill() {
      state.money += 300;
      state.kills += 1;
    },
    awardPlant() {
      state.money += 300;
      state.plants += 1;
    },
    awardRound(win) {
      if (win) {
        state.money += 3250;
        state.lossStreak = 0;
      } else {
        state.money += Math.min(2900, 1900 + state.lossStreak * 500);
        state.lossStreak += 1;
      }
    },
    buy(item) {
      if (item.kind === 'weapon') {
        const def = WEAPONS[item.id];
        if (!def || !canAfford(def.price) || state.primary === item.id) return false;
        state.money -= def.price;
        state.primary = item.id;
        return true;
      }
      if (item.kind === 'grenade') {
        const def = GRENADES[item.id];
        if (!def || !canAfford(def.price)) return false;
        state.money -= def.price;
        state.grenades[item.id] += 1;
        return true;
      }
      if (item.kind === 'armor') {
        if (state.armor || !canAfford(650)) return false;
        state.money -= 650;
        state.armor = true;
        return true;
      }
      return false;
    },
  };
}
