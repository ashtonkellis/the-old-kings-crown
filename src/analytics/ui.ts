import { loadLog, clearLog, GameRecord } from './log';
import { computeStats, formatPct, OverallStats } from './stats';
import { runBatch, PlayerSlot } from './simulate';
import { BOT_REGISTRY } from '../ai/bot';
import { Faction } from '../engine/types';

const FACTION_LABEL: Record<Faction, string> = {
  nobility:  'Nobility',
  clans:     'Clans',
  uprising:  'Uprising',
  gathering: 'Gathering',
};

const FACTION_COLOR: Record<Faction, string> = {
  nobility:  '#4a7fc1',
  clans:     '#3a9b8c',
  uprising:  '#c14a4a',
  gathering: '#8a4ac1',
};

const ALL_FACTIONS: Faction[] = ['nobility', 'clans', 'uprising', 'gathering'];

// ─── Toggle button (injected into header) ─────────────────────────────────────

export function initStatsButton(): void {
  const header = document.querySelector('#game-header') as HTMLElement | null;
  if (!header || document.getElementById('stats-toggle-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'stats-toggle-btn';
  btn.textContent = 'Stats';
  btn.title = 'Game history & win rates';
  btn.addEventListener('click', toggleStatsPanel);
  header.appendChild(btn);
}

function toggleStatsPanel(): void {
  const existing = document.getElementById('stats-overlay');
  if (existing) {
    existing.remove();
  } else {
    openStatsPanel('history');
  }
}

// ─── Main panel ───────────────────────────────────────────────────────────────

let activeTab: 'history' | 'simulate' = 'history';

function openStatsPanel(tab: 'history' | 'simulate'): void {
  activeTab = tab;
  const overlay = document.createElement('div');
  overlay.id = 'stats-overlay';

  const panel = document.createElement('div');
  panel.id = 'stats-panel';
  overlay.appendChild(panel);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  renderPanel(panel);
  document.body.appendChild(overlay);
}

function renderPanel(panel: HTMLElement): void {
  panel.innerHTML = '';
  panel.appendChild(makeTopBar(panel));
  panel.appendChild(makeTabBar(panel));

  if (activeTab === 'history') {
    renderHistoryTab(panel);
  } else {
    renderSimulateTab(panel);
  }
}

// ─── Top bar (title + close) ──────────────────────────────────────────────────

function makeTopBar(panel: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'stats-header-row';

  const title = document.createElement('h2');
  title.textContent = 'The Old King\'s Crown';
  row.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'stats-actions';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'stats-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => {
    document.getElementById('stats-overlay')?.remove();
  });
  actions.appendChild(closeBtn);
  row.appendChild(actions);
  return row;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function makeTabBar(panel: HTMLElement): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'stats-tab-bar';

  for (const tab of ['history', 'simulate'] as const) {
    const btn = document.createElement('button');
    btn.className = `stats-tab${activeTab === tab ? ' active' : ''}`;
    btn.textContent = tab === 'history' ? 'History' : 'Simulate';
    btn.addEventListener('click', () => {
      activeTab = tab;
      renderPanel(panel);
    });
    bar.appendChild(btn);
  }

  return bar;
}

// ─── History tab ──────────────────────────────────────────────────────────────

function renderHistoryTab(panel: HTMLElement): void {
  const records = loadLog();
  const stats = computeStats(records);

  const toolbar = document.createElement('div');
  toolbar.className = 'stats-toolbar';

  if (records.length > 0) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'stats-btn';
    exportBtn.textContent = 'Export JSON';
    exportBtn.addEventListener('click', () => exportJSON(records));
    toolbar.appendChild(exportBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'stats-btn stats-btn-danger';
    clearBtn.textContent = 'Clear Log';
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all game history? This cannot be undone.')) {
        clearLog();
        renderPanel(panel);
      }
    });
    toolbar.appendChild(clearBtn);
  }
  if (toolbar.children.length > 0) panel.appendChild(toolbar);

  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = 'No games recorded yet. Play a game to completion or run a simulation.';
    panel.appendChild(empty);
    return;
  }

  panel.appendChild(makeSummary(stats));
  panel.appendChild(makeFactionTable(stats));
  if (stats.matchups.length > 0) panel.appendChild(makeMatchupTable(stats));
  panel.appendChild(makeRecentGames(records));
}

// ─── Simulate tab ─────────────────────────────────────────────────────────────

function renderSimulateTab(panel: HTMLElement): void {
  const botVersions = Object.keys(BOT_REGISTRY);

  // ── State for the form ────────────────────────────────────────────────────
  let playerCount = 2;
  let gameLength: 'short' | 'standard' | 'extended' = 'standard';
  let gameCount = 100;
  let isRunning = false;

  const slots: { faction: Faction; botVersion: string }[] = [
    { faction: 'nobility', botVersion: botVersions[0] },
    { faction: 'clans',    botVersion: botVersions[0] },
    { faction: 'uprising', botVersion: botVersions[0] },
    { faction: 'gathering', botVersion: botVersions[0] },
  ];

  // ── Containers ────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'sim-wrap';

  // Player count
  const pcRow = document.createElement('div');
  pcRow.className = 'sim-row';
  const pcLabel = document.createElement('span');
  pcLabel.className = 'sim-label';
  pcLabel.textContent = 'Players';
  pcRow.appendChild(pcLabel);
  const pcBtns = document.createElement('div');
  pcBtns.className = 'sim-btn-group';
  for (const n of [2, 3, 4]) {
    const b = document.createElement('button');
    b.className = `sim-choice${playerCount === n ? ' active' : ''}`;
    b.textContent = String(n);
    b.addEventListener('click', () => {
      if (isRunning) return;
      playerCount = n;
      redraw();
    });
    pcBtns.appendChild(b);
  }
  pcRow.appendChild(pcBtns);
  wrap.appendChild(pcRow);

  // Slot table (rebuilt on redraw)
  const slotTable = document.createElement('div');
  slotTable.className = 'sim-slots';
  wrap.appendChild(slotTable);

  function buildSlotTable(): void {
    slotTable.innerHTML = '';
    const hdr = document.createElement('div');
    hdr.className = 'sim-slot-hdr';
    hdr.innerHTML = '<span>Slot</span><span>Faction</span><span>Bot Version</span>';
    slotTable.appendChild(hdr);

    for (let i = 0; i < playerCount; i++) {
      const row = document.createElement('div');
      row.className = 'sim-slot-row';

      const pidLabel = document.createElement('span');
      pidLabel.className = 'sim-pid';
      pidLabel.textContent = `P${i + 1}`;
      row.appendChild(pidLabel);

      const factionSel = document.createElement('select');
      factionSel.className = 'sim-select';
      for (const f of ALL_FACTIONS) {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = FACTION_LABEL[f];
        if (f === slots[i].faction) opt.selected = true;
        factionSel.appendChild(opt);
      }
      factionSel.addEventListener('change', () => {
        slots[i].faction = factionSel.value as Faction;
      });
      row.appendChild(factionSel);

      const botSel = document.createElement('select');
      botSel.className = 'sim-select';
      for (const v of botVersions) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        if (v === slots[i].botVersion) opt.selected = true;
        botSel.appendChild(opt);
      }
      botSel.addEventListener('change', () => {
        slots[i].botVersion = botSel.value;
      });
      row.appendChild(botSel);

      slotTable.appendChild(row);
    }
  }

  // Game length
  const glRow = document.createElement('div');
  glRow.className = 'sim-row';
  const glLabel = document.createElement('span');
  glLabel.className = 'sim-label';
  glLabel.textContent = 'Length';
  glRow.appendChild(glLabel);
  const glBtns = document.createElement('div');
  glBtns.className = 'sim-btn-group';
  for (const gl of ['short', 'standard', 'extended'] as const) {
    const b = document.createElement('button');
    b.className = `sim-choice${gameLength === gl ? ' active' : ''}`;
    b.textContent = gl.charAt(0).toUpperCase() + gl.slice(1);
    b.addEventListener('click', () => {
      if (isRunning) return;
      gameLength = gl;
      glBtns.querySelectorAll('.sim-choice').forEach((el, idx) => {
        el.classList.toggle('active', ['short', 'standard', 'extended'][idx] === gl);
      });
    });
    glBtns.appendChild(b);
  }
  glRow.appendChild(glBtns);
  wrap.appendChild(glRow);

  // Game count
  const gcRow = document.createElement('div');
  gcRow.className = 'sim-row';
  const gcLabel = document.createElement('span');
  gcLabel.className = 'sim-label';
  gcLabel.textContent = 'Games';
  gcRow.appendChild(gcLabel);
  const gcGroup = document.createElement('div');
  gcGroup.className = 'sim-count-group';
  const presets = [10, 100, 500, 1000];
  for (const n of presets) {
    const b = document.createElement('button');
    b.className = `sim-choice${gameCount === n ? ' active' : ''}`;
    b.textContent = String(n);
    b.addEventListener('click', () => {
      if (isRunning) return;
      gameCount = n;
      customInput.value = String(n);
      gcGroup.querySelectorAll('.sim-choice').forEach((el, idx) => {
        el.classList.toggle('active', presets[idx] === n);
      });
    });
    gcGroup.appendChild(b);
  }
  const customInput = document.createElement('input');
  customInput.type = 'number';
  customInput.min = '1';
  customInput.max = '10000';
  customInput.value = String(gameCount);
  customInput.className = 'sim-custom-input';
  customInput.addEventListener('change', () => {
    const v = parseInt(customInput.value);
    if (!isNaN(v) && v > 0) {
      gameCount = v;
      gcGroup.querySelectorAll('.sim-choice').forEach(el => el.classList.remove('active'));
    }
  });
  gcGroup.appendChild(customInput);
  gcRow.appendChild(gcGroup);
  wrap.appendChild(gcRow);

  // Progress bar + status
  const progressWrap = document.createElement('div');
  progressWrap.className = 'sim-progress-wrap hidden';
  const progressBar = document.createElement('div');
  progressBar.className = 'sim-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'sim-progress-fill';
  progressBar.appendChild(progressFill);
  const progressLabel = document.createElement('span');
  progressLabel.className = 'sim-progress-label';
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(progressLabel);
  wrap.appendChild(progressWrap);

  // Run button
  const runBtn = document.createElement('button');
  runBtn.className = 'sim-run-btn';
  runBtn.textContent = 'Run Simulation';
  runBtn.addEventListener('click', async () => {
    if (isRunning) return;
    isRunning = true;
    runBtn.disabled = true;
    runBtn.textContent = 'Running…';
    progressWrap.classList.remove('hidden');
    resultsWrap.innerHTML = '';

    const activeSlots: PlayerSlot[] = slots.slice(0, playerCount).map(s => ({ ...s }));

    const batchRecords = await runBatch(
      activeSlots,
      gameLength,
      gameCount,
      (done, total) => {
        const pct = (done / total) * 100;
        progressFill.style.width = `${pct}%`;
        progressLabel.textContent = `${done} / ${total}`;
      }
    );

    isRunning = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run Simulation';
    progressWrap.classList.add('hidden');

    renderBatchResults(resultsWrap, batchRecords, activeSlots);
  });
  wrap.appendChild(runBtn);

  // Results
  const resultsWrap = document.createElement('div');
  resultsWrap.className = 'sim-results';
  wrap.appendChild(resultsWrap);

  panel.appendChild(wrap);

  // initial slot render
  function redraw(): void {
    pcBtns.querySelectorAll('.sim-choice').forEach((el, idx) => {
      el.classList.toggle('active', [2, 3, 4][idx] === playerCount);
    });
    buildSlotTable();
  }

  buildSlotTable();
}

function renderBatchResults(
  container: HTMLElement,
  records: GameRecord[],
  slots: PlayerSlot[]
): void {
  container.innerHTML = '';
  if (records.length === 0) {
    container.textContent = 'No games completed.';
    return;
  }

  const stats = computeStats(records);

  // Summary line
  const summary = document.createElement('div');
  summary.className = 'sim-result-summary';
  const ties = records.filter(r => r.winnerId === null).length;
  summary.textContent = `${records.length} games completed · ${ties} ties · avg ${stats.avgRounds.toFixed(1)} rounds`;
  container.appendChild(summary);

  // Per-faction results
  const tbl = document.createElement('table');
  tbl.className = 'stats-table';
  tbl.innerHTML = `
    <thead><tr>
      <th>Faction</th><th>Bot</th><th>Games</th><th>Wins</th><th>Win %</th><th>Avg Inf</th>
    </tr></thead>
  `;
  const tbody = document.createElement('tbody');

  // Build a mapping from faction to bot version used in this run
  const factionBot: Record<string, string> = {};
  for (const slot of slots) {
    factionBot[slot.faction] = slot.botVersion;
  }

  for (const f of stats.factions) {
    const dot = `<span class="faction-dot" style="background:${FACTION_COLOR[f.faction]}"></span>`;
    const bar = `<div class="pct-bar" style="width:${formatPct(f.winRate)};background:${FACTION_COLOR[f.faction]}44;position:absolute;top:0;left:0;bottom:0;pointer-events:none"></div>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dot}${FACTION_LABEL[f.faction]}</td>
      <td style="color:var(--text-faint);font-size:0.78rem">${factionBot[f.faction] ?? '—'}</td>
      <td>${f.games}</td>
      <td>${f.wins}</td>
      <td style="position:relative">${bar}${formatPct(f.winRate)}</td>
      <td>${f.avgInfluence.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  }

  tbl.appendChild(tbody);
  container.appendChild(tbl);

  // Win condition breakdown
  const wcRow = document.createElement('div');
  wcRow.className = 'sim-wc-row';
  const wc = stats.byWinCondition;
  wcRow.innerHTML = `
    <span class="sim-wc-item">By influence: <b>${wc.influence}</b></span>
    <span class="sim-wc-item">By favour: <b>${wc.favour}</b></span>
    <span class="sim-wc-item">By order: <b>${wc.order}</b></span>
    <span class="sim-wc-item">Ties: <b>${wc.tie}</b></span>
  `;
  container.appendChild(wcRow);
}

// ─── History tab helpers ──────────────────────────────────────────────────────

function makeSummary(stats: OverallStats): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'stats-section';

  const cells: [string, string][] = [
    ['Games', String(stats.totalGames)],
    ['Avg rounds', stats.avgRounds.toFixed(1)],
    ['Human wins', formatPct(stats.byPlayerType.human.winRate)],
    ['Bot wins', formatPct(stats.byPlayerType.bot.winRate)],
    ['By influence', String(stats.byWinCondition.influence)],
    ['By favour', String(stats.byWinCondition.favour)],
    ['By order', String(stats.byWinCondition.order)],
    ['Ties', String(stats.byWinCondition.tie)],
  ];

  const grid = document.createElement('div');
  grid.className = 'stats-summary-grid';
  for (const [label, val] of cells) {
    const cell = document.createElement('div');
    cell.className = 'stats-cell';
    cell.innerHTML = `<span class="stats-val">${val}</span><span class="stats-label">${label}</span>`;
    grid.appendChild(cell);
  }

  sec.appendChild(grid);
  return sec;
}

function makeFactionTable(stats: OverallStats): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'stats-section';

  const h3 = document.createElement('h3');
  h3.textContent = 'Faction Win Rates';
  sec.appendChild(h3);

  const table = document.createElement('table');
  table.className = 'stats-table';
  table.innerHTML = `
    <thead><tr>
      <th>Faction</th><th>Games</th><th>Wins</th><th>Win %</th><th>Avg Inf</th>
    </tr></thead>
  `;

  const tbody = document.createElement('tbody');
  for (const f of stats.factions) {
    const tr = document.createElement('tr');
    const dot = `<span class="faction-dot" style="background:${FACTION_COLOR[f.faction]}"></span>`;
    const winPct = formatPct(f.winRate);
    tr.innerHTML = `
      <td>${dot}${FACTION_LABEL[f.faction]}</td>
      <td>${f.games}</td>
      <td>${f.wins}</td>
      <td style="position:relative">
        <div class="pct-bar" style="width:${winPct};background:${FACTION_COLOR[f.faction]}44"></div>
        ${winPct}
      </td>
      <td>${f.avgInfluence.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  sec.appendChild(table);
  return sec;
}

function makeMatchupTable(stats: OverallStats): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'stats-section';

  const h3 = document.createElement('h3');
  h3.textContent = 'Head-to-Head (2-player)';
  sec.appendChild(h3);

  const table = document.createElement('table');
  table.className = 'stats-table';
  table.innerHTML = `
    <thead><tr>
      <th>Matchup</th><th>Games</th><th>A wins</th><th>B wins</th><th>Ties</th>
    </tr></thead>
  `;

  const tbody = document.createElement('tbody');
  for (const mu of stats.matchups) {
    const dotA = `<span class="faction-dot" style="background:${FACTION_COLOR[mu.factionA]}"></span>`;
    const dotB = `<span class="faction-dot" style="background:${FACTION_COLOR[mu.factionB]}"></span>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dotA}${FACTION_LABEL[mu.factionA]} vs ${dotB}${FACTION_LABEL[mu.factionB]}</td>
      <td>${mu.games}</td>
      <td>${mu.aWins} (${mu.games > 0 ? formatPct(mu.aWins / mu.games) : '—'})</td>
      <td>${mu.bWins} (${mu.games > 0 ? formatPct(mu.bWins / mu.games) : '—'})</td>
      <td>${mu.ties}</td>
    `;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  sec.appendChild(table);
  return sec;
}

function makeRecentGames(records: GameRecord[]): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'stats-section';

  const h3 = document.createElement('h3');
  h3.textContent = `Recent Games (${Math.min(records.length, 20)} of ${records.length})`;
  sec.appendChild(h3);

  const list = document.createElement('div');
  list.className = 'stats-game-list';

  const recent = [...records].reverse().slice(0, 20);
  for (const rec of recent) {
    const item = document.createElement('div');
    item.className = 'stats-game-item';

    const date = new Date(rec.timestamp).toLocaleString();
    const winnerPlayer = rec.players.find(p => p.playerId === rec.winnerId);
    const winStr = winnerPlayer
      ? `${FACTION_LABEL[winnerPlayer.faction]} (P${winnerPlayer.playerId}, ${winnerPlayer.playerType}) won [${rec.winCondition}]`
      : 'Tie';
    const scores = rec.players.map(p => `${FACTION_LABEL[p.faction]}:${p.finalInfluence}`).join(' · ');

    item.innerHTML = `
      <div class="game-item-top">
        <span class="game-date">${date}</span>
        <span class="game-rounds">Round ${rec.rounds}/${rec.maxRounds}</span>
      </div>
      <div class="game-item-result">${winStr}</div>
      <div class="game-item-scores">${scores}</div>
    `;

    if (winnerPlayer) {
      item.style.borderLeftColor = FACTION_COLOR[winnerPlayer.faction];
    }

    list.appendChild(item);
  }

  sec.appendChild(list);
  return sec;
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportJSON(records: GameRecord[]): void {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tokc-game-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
