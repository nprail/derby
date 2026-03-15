'use strict';
/**
 * bracket.js
 * Bracket / schedule generation for Pinewood Derby Race Manager.
 *
 * Exported functions:
 *   generateRoundRobin(racers, lanesPerHeat)
 *   generateSingleElim(racers, lanesPerHeat)
 *   generateDoubleElim(racers, lanesPerHeat)
 *   generatePoints(racers, lanesPerHeat, numRounds)
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHeat(id, round, number, racerIds) {
  return {
    id,
    round,
    number,
    lanes: racerIds.map((rid, i) => ({ lane: i + 1, racerId: rid })),
    status: 'pending',
    trackId: null,
    result: null,
  };
}

/**
 * Sort racers by seed (ascending; missing seed treated as 999).
 */
function sortBySeed(racers) {
  return [...racers].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
}

/**
 * Build a circle-method rotation schedule for round-robin tournaments.
 * Returns an array of rounds, each round is an array of groups (arrays of racerId).
 *
 * Algorithm: fix racers[0], rotate the rest left by one each round.
 * Total rounds = n-1 (even n) or n (odd n, with one null "bye" slot added).
 */
function buildCircleSchedule(ids, lanesPerHeat) {
  const L = Math.min(lanesPerHeat, ids.length);
  let circle = [...ids];
  if (circle.length % 2 !== 0) circle.push(null); // bye for odd count
  const M = circle.length;
  const numRounds = M - 1;
  const schedule = [];

  for (let r = 0; r < numRounds; r++) {
    const roundGroups = [];
    for (let i = 0; i < circle.length; i += L) {
      const group = circle.slice(i, i + L).filter((id) => id !== null);
      if (group.length >= 2) roundGroups.push(group);
    }
    schedule.push(roundGroups);

    // Rotate: fix circle[0], shift rest left by 1
    const first = circle[0];
    const rest = circle.slice(1);
    rest.push(rest.shift());
    circle = [first, ...rest];
  }

  return schedule;
}

// ── Round Robin ───────────────────────────────────────────────────────────────

/**
 * Generate a round-robin schedule.
 * Each racer competes against every other racer at least once.
 * Total rounds = n-1 (even n) or n (odd n).
 * Each round groups all racers into heats of lanesPerHeat.
 *
 * @param {Array} racers  – [{id, seed, ...}]
 * @param {number} lanesPerHeat
 * @returns {object} bracket
 */
function generateRoundRobin(racers, lanesPerHeat) {
  const n = racers.length;
  if (n < 2) return { rounds: [] };

  const sorted = sortBySeed(racers);
  const ids = sorted.map((r) => r.id);
  const schedule = buildCircleSchedule(ids, lanesPerHeat);

  const rounds = [];
  let heatCounter = 1;

  schedule.forEach((roundGroups, r) => {
    const heats = roundGroups.map((group, hi) =>
      makeHeat(`heat-${r + 1}-${hi + 1}`, r + 1, heatCounter++, group),
    );
    rounds.push({ id: `round-${r + 1}`, name: `Round ${r + 1}`, heats });
  });

  return { rounds };
}

// ── Points-Based ──────────────────────────────────────────────────────────────

/**
 * Generate a points-based schedule (fixed number of rounds, each racer races once per round).
 * Uses the same circle-method rotation as round-robin but stops at numRounds.
 *
 * @param {Array} racers
 * @param {number} lanesPerHeat
 * @param {number} numRounds  – total number of racing rounds
 * @returns {object} bracket
 */
function generatePoints(racers, lanesPerHeat, numRounds) {
  const n = racers.length;
  if (n < 2) return { rounds: [] };

  const sorted = sortBySeed(racers);
  const ids = sorted.map((r) => r.id);
  const schedule = buildCircleSchedule(ids, lanesPerHeat);

  const capped = schedule.slice(0, numRounds);
  const rounds = [];
  let heatCounter = 1;

  capped.forEach((roundGroups, r) => {
    const heats = roundGroups.map((group, hi) =>
      makeHeat(`heat-${r + 1}-${hi + 1}`, r + 1, heatCounter++, group),
    );
    rounds.push({ id: `round-${r + 1}`, name: `Round ${r + 1}`, heats });
  });

  return { rounds };
}

// ── Single Elimination ────────────────────────────────────────────────────────

/**
 * Standard single-elimination bracket.
 * Racers seeded 1..N; bracket size padded to next power of lanesPerHeat.
 * Higher rounds have null placeholders (winner TBD).
 *
 * @param {Array} racers
 * @param {number} lanesPerHeat
 * @returns {object} bracket
 */
function generateSingleElim(racers, lanesPerHeat) {
  const n = racers.length;
  if (n < 2) return { rounds: [] };

  const L = Math.min(lanesPerHeat, n);
  const sorted = sortBySeed(racers);

  // Smallest power of L that fits all racers
  let bracketSize = L;
  while (bracketSize < n) bracketSize *= L;
  const numRounds = Math.ceil(Math.log(bracketSize) / Math.log(L));

  // First-round slots: seed 1, then spread remaining seeds so top seeds meet last
  const slots = interleaveSeeds(
    sorted.map((r) => r.id),
    bracketSize,
    L,
  );

  const rounds = [];
  let heatCounter = 1;

  for (let r = 0; r < numRounds; r++) {
    const heatsInRound = Math.floor(bracketSize / Math.pow(L, r + 1));
    const heats = [];

    for (let h = 0; h < heatsInRound; h++) {
      const heatId = `heat-${r + 1}-${h + 1}`;
      let lanes;

      if (r === 0) {
        const start = h * L;
        lanes = slots.slice(start, start + L).map((id, i) => ({
          lane: i + 1,
          racerId: id,
        }));
      } else {
        lanes = Array.from({ length: L }, (_, i) => ({
          lane: i + 1,
          racerId: null,
        }));
      }

      heats.push({
        id: heatId,
        round: r + 1,
        number: heatCounter++,
        lanes,
        status: 'pending',
        trackId: null,
        result: null,
      });
    }

    let roundName;
    if (r === numRounds - 1) roundName = 'Final';
    else if (r === numRounds - 2 && numRounds > 2) roundName = 'Semifinal';
    else roundName = `Round ${r + 1}`;

    rounds.push({ id: `round-${r + 1}`, name: roundName, heats });
  }

  return { rounds };
}

/**
 * Interleave seeds so top seeds are separated across the bracket.
 * Seed 1 → slot 0, Seed 2 → last slot, Seed 3 → middle, etc.
 * (Standard "balanced" seeding for single elimination.)
 */
function interleaveSeeds(ids, bracketSize, L) {
  const slots = new Array(bracketSize).fill(null);

  function place(seedIndex, positions) {
    if (seedIndex >= ids.length || positions.length === 0) return;
    if (positions.length === 1) {
      slots[positions[0]] = ids[seedIndex] ?? null;
      return;
    }
    // Assign seed seedIndex to positions[0], then recurse for rest
    slots[positions[0]] = ids[seedIndex] ?? null;

    if (seedIndex + 1 < ids.length) {
      // Place next seed at the opposite end of the remaining positions
      const opposite = positions[positions.length - 1];
      slots[opposite] = ids[seedIndex + 1];
    }

    if (positions.length > 2) {
      const mid = Math.floor(positions.length / 2);
      place(seedIndex + 2, positions.slice(1, mid + 1));
      place(
        seedIndex + 2 + Math.floor((positions.length - 2) / 2),
        positions.slice(mid + 1, positions.length - 1),
      );
    }
  }

  const allPositions = Array.from({ length: bracketSize }, (_, i) => i);
  place(0, allPositions);
  return slots;
}

// ── Double Elimination ────────────────────────────────────────────────────────

/**
 * Double-elimination bracket.
 * Generates a winners bracket and a losers bracket.
 * Each round in the winners bracket is matched by a losers bracket round.
 * Final: winners-bracket champion vs losers-bracket champion.
 *
 * @param {Array} racers
 * @param {number} lanesPerHeat
 * @returns {object} bracket
 */
function generateDoubleElim(racers, lanesPerHeat) {
  const n = racers.length;
  if (n < 2) return { rounds: [] };

  const L = Math.min(lanesPerHeat, n);
  const sorted = sortBySeed(racers);

  // Winners bracket: same as single elim
  let bracketSize = L;
  while (bracketSize < n) bracketSize *= L;
  const wRounds = Math.ceil(Math.log(bracketSize) / Math.log(L));

  const slots = interleaveSeeds(
    sorted.map((r) => r.id),
    bracketSize,
    L,
  );

  const rounds = [];
  let heatCounter = 1;

  // ── Winners bracket ──────────────────────────────────────────────────────
  for (let r = 0; r < wRounds; r++) {
    const heatsInRound = Math.floor(bracketSize / Math.pow(L, r + 1));
    const heats = [];

    for (let h = 0; h < heatsInRound; h++) {
      let lanes;
      if (r === 0) {
        const start = h * L;
        lanes = slots.slice(start, start + L).map((id, i) => ({
          lane: i + 1,
          racerId: id,
        }));
      } else {
        lanes = Array.from({ length: L }, (_, i) => ({
          lane: i + 1,
          racerId: null,
        }));
      }

      heats.push({
        id: `heat-W${r + 1}-${h + 1}`,
        round: r + 1,
        number: heatCounter++,
        lanes,
        status: 'pending',
        trackId: null,
        result: null,
        bracket: 'winners',
      });
    }

    let roundName;
    if (r === wRounds - 1) roundName = 'Winners Final';
    else if (r === wRounds - 2 && wRounds > 2) roundName = 'Winners Semifinal';
    else roundName = `Winners Round ${r + 1}`;

    rounds.push({ id: `round-W${r + 1}`, name: roundName, heats, bracket: 'winners' });
  }

  // ── Losers bracket ───────────────────────────────────────────────────────
  // Number of losers bracket rounds ≈ 2*(wRounds-1)
  const lRounds = Math.max(1, 2 * (wRounds - 1));
  const losersPerFirstRound = Math.floor(bracketSize / L); // losers from W round 1

  for (let r = 0; r < lRounds; r++) {
    const roundNum = wRounds + r + 1;
    const heatsInRound = Math.max(1, Math.floor(losersPerFirstRound / Math.pow(L, Math.ceil((r + 1) / 2))));
    const heats = [];

    for (let h = 0; h < heatsInRound; h++) {
      heats.push({
        id: `heat-L${r + 1}-${h + 1}`,
        round: roundNum,
        number: heatCounter++,
        lanes: Array.from({ length: L }, (_, i) => ({ lane: i + 1, racerId: null })),
        status: 'pending',
        trackId: null,
        result: null,
        bracket: 'losers',
      });
    }

    let roundName;
    if (r === lRounds - 1) roundName = 'Losers Final';
    else roundName = `Losers Round ${r + 1}`;

    rounds.push({ id: `round-L${r + 1}`, name: roundName, heats, bracket: 'losers' });
  }

  // ── Grand Final ──────────────────────────────────────────────────────────
  rounds.push({
    id: 'round-GF',
    name: 'Grand Final',
    bracket: 'grand-final',
    heats: [
      {
        id: 'heat-GF-1',
        round: wRounds + lRounds + 1,
        number: heatCounter++,
        lanes: Array.from({ length: Math.min(L, 2) }, (_, i) => ({
          lane: i + 1,
          racerId: null,
        })),
        status: 'pending',
        trackId: null,
        result: null,
        bracket: 'grand-final',
      },
    ],
  });

  return { rounds };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  generateRoundRobin,
  generateSingleElim,
  generateDoubleElim,
  generatePoints,
};
