/* ═══════════════════════════════════════════════════════════════
   THE OLD KING'S CROWN — Game JS (UI layer, no game logic yet)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────────────────
const state = {
  round: 1,
  maxRounds: 5,
  phaseIndex: 0,
  phases: ['Spring', 'Summer', 'Autumn', 'Winter'],
  activePlayer: 1,
  playerCount: 4,
  players: {
    1: { faction: 'nobility',  influence: 0, lore: 0, handSize: 6 },
    2: { faction: 'clans',     influence: 0, lore: 0, handSize: 6 },
    3: { faction: 'uprising',  influence: 0, lore: 0, handSize: 6 },
    4: { faction: 'gathering', influence: 0, lore: 0, handSize: 6 },
  },
};

// ── Tooltip ────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');
let tooltipTimer = null;

function showTooltip(text, x, y) {
  tooltip.textContent = text;
  positionTooltip(x, y);
  tooltip.classList.add('visible');
}

function positionTooltip(x, y) {
  const pad = 12;
  const tw = tooltip.offsetWidth || 180;
  const th = tooltip.offsetHeight || 40;
  let left = x + pad;
  let top  = y + pad;
  if (left + tw > window.innerWidth  - 8) left = x - tw - pad;
  if (top  + th > window.innerHeight - 8) top  = y - th - pad;
  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

document.addEventListener('mousemove', (e) => {
  if (tooltip.classList.contains('visible')) {
    positionTooltip(e.clientX, e.clientY);
  }
});

// Attach tooltip to all elements that have a title attribute (so we can
// control styling instead of relying on the browser's native tooltip)
document.querySelectorAll('[title]').forEach(el => {
  const text = el.getAttribute('title');
  el.removeAttribute('title');          // prevent native tooltip
  el.dataset.tip = text;

  el.addEventListener('mouseenter', (e) => {
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => showTooltip(text, e.clientX, e.clientY), 300);
  });
  el.addEventListener('mouseleave', () => {
    clearTimeout(tooltipTimer);
    hideTooltip();
  });
});

// ── Click feedback (flash) ─────────────────────────────────────
function flashZone(el) {
  el.classList.remove('flash');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}

document.addEventListener('click', (e) => {
  const zone = e.target.closest('[data-zone]');
  if (zone) flashZone(zone);
});

// ── Phase cycling (demo) ───────────────────────────────────────
const phaseChip  = document.getElementById('phase-chip');
const phaseValue = document.getElementById('phase-value');
const seasonSteps = document.querySelectorAll('.season-step');

function updatePhaseDisplay() {
  const phase = state.phases[state.phaseIndex];
  phaseValue.textContent = phase;

  seasonSteps.forEach(s => {
    s.classList.toggle('active', s.dataset.season === phase.toLowerCase());
  });
}

function advancePhase() {
  state.phaseIndex = (state.phaseIndex + 1) % state.phases.length;
  if (state.phaseIndex === 0) advanceRound();
  updatePhaseDisplay();
  flashZone(phaseChip);
}

phaseChip.addEventListener('click', advancePhase);
seasonSteps.forEach(s => s.addEventListener('click', () => {
  const idx = state.phases.findIndex(p => p.toLowerCase() === s.dataset.season);
  if (idx !== -1) { state.phaseIndex = idx; updatePhaseDisplay(); }
}));

// ── Round track ────────────────────────────────────────────────
const roundValue = document.getElementById('round-value');
const roundSlots = document.querySelectorAll('.round-slot');

function updateRoundDisplay() {
  roundValue.textContent = `${state.round} / ${state.maxRounds}`;
  roundSlots.forEach(s => {
    const r = parseInt(s.dataset.round, 10);
    s.classList.toggle('active', r === state.round);
  });
}

function advanceRound() {
  if (state.round < state.maxRounds) {
    state.round++;
    updateRoundDisplay();
  }
}

roundSlots.forEach(s => {
  s.addEventListener('click', () => {
    const r = parseInt(s.dataset.round, 10);
    state.round = Math.min(r, state.maxRounds);
    updateRoundDisplay();
    flashZone(s);
  });
});

// ── Tactic tile toggle (unexhausted ↔ exhausted) ──────────────
document.querySelectorAll('.tactic-tile').forEach(tile => {
  tile.addEventListener('click', (e) => {
    e.stopPropagation();
    const isEx = tile.classList.contains('exhausted');
    tile.classList.toggle('exhausted', !isEx);
    tile.querySelector('.tactic-state').textContent = isEx ? 'Ready' : 'Exhausted';
    flashZone(tile);
  });
});

// ── Supporter click: toggle deployed state ─────────────────────
document.querySelectorAll('.supporter-piece').forEach(sup => {
  sup.addEventListener('click', (e) => {
    e.stopPropagation();
    sup.classList.toggle('deployed');
    const tip = sup.dataset.tip || '';
    if (sup.classList.contains('deployed')) {
      sup.dataset.tip = tip.replace('available', 'deployed — on the Map');
    } else {
      sup.dataset.tip = tip.replace('deployed — on the Map', 'available');
    }
    flashZone(sup);
  });
});

// ── Herald slot click: toggle herald presence ─────────────────
document.querySelectorAll('.herald-slot').forEach(slot => {
  const location = slot.closest('[data-location]');
  if (!location) return;

  // Determine which herald icons exist
  const p1Herald = document.querySelector('#player-board  .herald-piece');
  const p2Herald = document.querySelector('#opponent-board .herald-piece');

  slot.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = slot.querySelector('.herald-placed');
    if (current) {
      // Remove herald
      current.remove();
      const emptySpan = document.createElement('span');
      emptySpan.className = 'herald-empty';
      emptySpan.textContent = '◎';
      slot.appendChild(emptySpan);
      flashZone(slot);
    } else {
      // Place P1 herald as demo
      slot.querySelector('.herald-empty')?.remove();
      const placed = document.createElement('span');
      placed.className = 'herald-placed nobility-herald';
      placed.textContent = '👑';
      slot.appendChild(placed);
      flashZone(slot);
    }
  });
});

// ── Region card slot click: reveal face-down card ─────────────
document.querySelectorAll('.region-card-slot').forEach(slot => {
  let revealed = false;
  const card = slot.querySelector('.faction-card-slot');
  if (!card) return;

  slot.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!revealed) {
      // Simulate card reveal
      card.classList.remove('card-back');
      card.style.background = 'rgba(20,14,6,0.97)';
      card.style.borderColor = 'var(--gold)';
      // Show a strength value
      const strength = Math.floor(Math.random() * 9) + 2;
      const label = card.querySelector('.slot-player-label');
      const strengthEl = document.createElement('div');
      strengthEl.className = 'card-strength';
      strengthEl.style.cssText = 'position:absolute;top:4px;left:4px;font-family:Cinzel,serif;font-size:14px;font-weight:700;color:var(--gold-light)';
      strengthEl.textContent = strength;
      card.appendChild(strengthEl);
      revealed = true;
      flashZone(card);
    } else {
      // Re-hide
      card.classList.add('card-back');
      card.style.background = '';
      card.style.borderColor = '';
      card.querySelector('.card-strength')?.remove();
      revealed = false;
    }
  });
});

// ── Kingdom's Favour disc click ────────────────────────────────
const favourDisc = document.getElementById('favour-disc');
if (favourDisc) {
  const useCounts = ['III', 'II', 'I'];
  let useIdx = 0;
  favourDisc.addEventListener('click', (e) => {
    e.stopPropagation();
    useIdx = (useIdx + 1) % useCounts.length;
    favourDisc.querySelector('.favour-uses').textContent = useCounts[useIdx];
    flashZone(favourDisc);
  });
}

// ── Empty card slot hover: show '+' hint ──────────────────────
document.querySelectorAll('.kc-card.empty, .council-card-slot.empty').forEach(slot => {
  slot.addEventListener('mouseenter', () => { slot.style.borderColor = 'var(--gold)'; });
  slot.addEventListener('mouseleave', () => { slot.style.borderColor = ''; });
});

// ── Active player cycling ──────────────────────────────────────
const turnValue = document.getElementById('turn-value');
const activePlayerMarker = document.querySelector('.active-player-marker');

document.querySelectorAll('.order-marker').forEach(marker => {
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    const faction = marker.dataset.faction;
    if (!faction) return;
    const names = { nobility: 'The Nobility', clans: 'The Clans', uprising: 'The Uprising', gathering: 'The Gathering' };
    turnValue.textContent = names[faction] || faction;
    // Move active player marker
    document.querySelectorAll('.active-player-marker').forEach(m => m.remove());
    const newMarker = document.createElement('div');
    newMarker.className = 'active-player-marker';
    newMarker.textContent = '★';
    marker.closest('.order-slot').appendChild(newMarker);
    flashZone(marker);
  });
});

// ── Influence / Lore token click (reserve → player supply demo) ──
document.querySelectorAll('.token-influence, .token-lore').forEach(token => {
  token.addEventListener('click', (e) => {
    e.stopPropagation();
    const isLore = token.classList.contains('token-lore');
    const countEl = token.nextElementSibling;
    const current = parseInt(countEl.textContent, 10);
    if (current > 0) {
      countEl.textContent = current - 1;
      // Give to active player
      const playerId = state.activePlayer;
      if (isLore) {
        state.players[playerId].lore++;
        document.getElementById(`p${playerId}-lore`).textContent = state.players[playerId].lore;
      } else {
        state.players[playerId].influence++;
        document.getElementById(`p${playerId}-influence`).textContent = state.players[playerId].influence;
      }
    }
    flashZone(token);
  });
});

// ── Keyboard shortcut: space = advance phase ──────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    advancePhase();
  }
});

// ── Player count selector ──────────────────────────────────────
function setPlayerCount(n) {
  state.playerCount = n;
  document.body.dataset.players = n;
  document.querySelectorAll('.pc-btn').forEach(b => {
    b.classList.toggle('active', +b.dataset.count === n);
  });
}

document.querySelectorAll('.pc-btn').forEach(b => {
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    setPlayerCount(+b.dataset.count);
  });
});

// ── Init ───────────────────────────────────────────────────────
setPlayerCount(4);
updatePhaseDisplay();
updateRoundDisplay();

console.log('%cThe Old King\'s Crown — UI ready.', 'font-family:serif;font-size:14px;color:#c9a84c;');
console.log('Click the Phase chip (or press Space) to cycle phases.');
console.log('Click tactic tiles to exhaust/ready them.');
console.log('Click herald slots to place/remove heralds.');
console.log('Click region card slots to reveal/hide face-down cards.');
