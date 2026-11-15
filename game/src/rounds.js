// Round and match flow: buy phase (15 s), live round (100 s), plant (3.5 s channel),
// detonation 40 s after plant, defuse (5 s channel), first team to 5 round wins takes
// the match. The carrier is the player each round; if the player dies, a living
// Vanguard bot carries the charge.
import { SITES } from './world.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3.5;
export const DETONATE_SECONDS = 40;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;

export function createRounds(random) {
  const state = {
    match: 1,
    round: 1,
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTime: 0,
    scoreAtk: 0,
    scoreDef: 0,
    site: 'A',
    bomb: { state: 'none', site: null, pos: null, carrier: 'player', plantedAt: 0, progress: 0, defuseProgress: 0 },
    lastWinner: null,
    lastReason: '',
  };

  function pickSite() {
    return random() < 0.5 ? 'A' : 'B';
  }

  function startRound() {
    state.site = pickSite();
    state.phase = 'buy';
    state.phaseTime = 0;
    state.bomb = { state: 'carried', site: null, pos: null, carrier: 'player', plantedAt: 0, progress: 0, defuseProgress: 0 };
  }

  function startMatch() {
    state.round = 1;
    state.scoreAtk = 0;
    state.scoreDef = 0;
    state.lastWinner = null;
    startRound();
  }

  function beginLive() {
    state.phase = 'live';
    state.phaseTime = 0;
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    if (winner === 'atk') state.scoreAtk += 1;
    else state.scoreDef += 1;
    state.lastWinner = winner;
    state.lastReason = reason;
    state.phaseTime = 0;
    if (state.scoreAtk >= WIN_ROUNDS || state.scoreDef >= WIN_ROUNDS) {
      state.phase = 'matchEnd';
    } else {
      state.phase = 'roundEnd';
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function plantAt(siteKey) {
    state.bomb.state = 'planted';
    state.bomb.site = siteKey;
    state.bomb.pos = SITES[siteKey].center.clone();
    state.bomb.plantedAt = state.phaseTime;
    state.bomb.progress = 1;
  }

  return {
    state,
    startMatch,
    startRound,
    beginLive,
    endRound,
    nextRound,
    plantAt,
    siteCenter() {
      return SITES[state.site].center;
    },
  };
}
