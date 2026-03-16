// Nickname system ----------------------------------------------------------
function getNickname() {
  let nick = document.cookie.match(/ventNickname=([^;]+)/);
  if (nick) return decodeURIComponent(nick[1]);
  const prefixes = [
    'Anon Furnace',
    'Midnight Dragon',
    'Keyboard Smasher',
    'Midnight Howler',
    'Slacking Rebel',
    'Grumpy Dude',
    'Roaring Emperor',
    'Raging Warrior',
    'Midnight Drifter',
    'Angry Bird',
  ];
  const name = `${prefixes[Math.floor(Math.random() * prefixes.length)]}#${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  document.cookie = `ventNickname=${encodeURIComponent(name)};max-age=${365 * 86400};path=/`;
  return name;
}

const myNickname = getNickname();
const nicknameDisplayEl = document.getElementById('nickname-display');
if (nicknameDisplayEl) {
  nicknameDisplayEl.textContent = myNickname;
}

// Monster avatar generator -------------------------------------------------
function hashCode(str) {
  let h = 0;
  const text = String(str || 'Anon');
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) - h) + text.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateMonsterAvatar(nickname) {
  const seed = hashCode(nickname || 'Anon');
  const rng = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const colors = ['#ff006e', '#00f0ff', '#39ff14', '#ff6600', '#bf00ff', '#ffff00'];
  const bg = colors[Math.floor(rng() * colors.length)];
  const fg = colors[Math.floor(rng() * colors.length)];
  const size = 8; // each pixel block is 8x8, grid is 7x7 but mirrored from 4 columns
  // main mirrored body
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      if (rng() > 0.45) {
        ctx.fillStyle = rng() > 0.5 ? bg : fg;
        const offsetY = (64 - 56) / 2;
        ctx.fillRect(x * size, y * size + offsetY, size, size);
        ctx.fillRect((6 - x) * size, y * size + offsetY, size, size);
      }
    }
  }
  // center column
  for (let y = 0; y < 7; y += 1) {
    if (rng() > 0.4) {
      ctx.fillStyle = rng() > 0.5 ? bg : fg;
      ctx.fillRect(3 * size, y * size + 4, size, size);
    }
  }
  return canvas.toDataURL();
}

// Category & rage state ----------------------------------------------------
let selectedCategory = 'Other';
let filterCategory = 'All';
let consecutivePosts = 0;

// Dark humor placeholders --------------------------------------------------
const placeholders = [
  'Who deserves your rage today?',
  'Write the frustration down, then blow it up.',
  'Your anger is worth its weight in gold.',
  'Deep breath… now scream in text.',
  'No bosses can see this feed.',
  'Vent as hard as you want; it all gets destroyed.',
  'Type it, torch it, leave no evidence.',
];

function rotatePlaceholder() {
  const ta = document.getElementById('ventInput') || document.getElementById('vent-input');
  if (ta) {
    ta.placeholder = placeholders[Math.floor(Math.random() * placeholders.length)];
  }
}

// Particle explosion system -----------------------------------------------
const fxCanvas = document.getElementById('fx-canvas');
const fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;
let particles = [];

function resizeFxCanvas() {
  if (!fxCanvas) return;
  fxCanvas.width = window.innerWidth;
  fxCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeFxCanvas);
resizeFxCanvas();

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1;
    this.decay = 0.01 + Math.random() * 0.02;
    this.size = 2 + Math.random() * 4;
    const palette = ['#ff006e', '#00f0ff', '#39ff14', '#ff6600', '#bf00ff'];
    this.color = palette[Math.floor(Math.random() * palette.length)];
  }
}

function spawnExplosion(x, y) {
  for (let i = 0; i < 150; i += 1) {
    particles.push(new Particle(x, y));
  }
}

function animateParticles() {
  if (!fxCtx || !fxCanvas) {
    requestAnimationFrame(animateParticles);
    return;
  }
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= p.decay;
    fxCtx.globalAlpha = p.life;
    fxCtx.fillStyle = p.color;
    fxCtx.fillRect(p.x, p.y, p.size, p.size);
  });
  fxCtx.globalAlpha = 1;
  requestAnimationFrame(animateParticles);
}

animateParticles();

// Global app state ---------------------------------------------------------
const state = {
  vents: [],
  category: 'All',
  composeCategory: 'Other',
  validCategories: ['Work', 'School', 'Life', 'Relationships', 'Other'],
  todayDestroyed: 0,
  categoryTotals: {},
  nickname: myNickname,
  avatarSeed: '',
  destroyStreak: 0,
  rageActive: false,
  lastDailyCount: 0,
  ws: null,
  wsConnected: false,
  comboTimer: null,
  audioContext: null,
};

const api = {
  async getProfile() {
    const res = await fetch('/api/profile');
    if (!res.ok) throw new Error('Failed to load configuration.');
    return res.json();
  },
  async getVents(category = 'All') {
    const query = category && category !== 'All' ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`/api/vents${query}`);
    if (!res.ok) throw new Error('Failed to load leaderboard.');
    return res.json();
  },
  async createVent(content, category, nickname) {
    const res = await fetch('/api/vents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category, nickname }),
    });
    const data = await res.json();
    if (!res.ok) {
      const message = data && data.error ? data.error : 'Failed to create vent.';
      throw new Error(message);
    }
    return data;
  },
  async likeVent(id) {
    const res = await fetch(`/api/vents/${id}/like`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data && data.error ? data.error : 'Failed to like vent.');
    }
    return data;
  },
  async getDailyCount() {
    const res = await fetch('/api/daily-count');
    if (!res.ok) throw new Error('Failed to load today’s count.');
    return res.json();
  },
};

function formatDateTime(isoLike) {
  if (!isoLike) return '';
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hashSeed(seed) {
  let hash = 0;
  const text = String(seed || 'seed');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function createMonsterSvg(seed) {
  const hash = hashSeed(seed);
  const hue = hash % 360;
  const eyeHue = (hue + 170) % 360;
  const bits = hash.toString(2).padStart(32, '0');
  const cells = [];
  const size = 5;
  const pixel = 14;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < Math.ceil(size / 2); x += 1) {
      const on = bits[(y * 3 + x) % bits.length] === '1';
      if (!on) continue;
      cells.push([x, y]);
      if (x !== size - 1 - x) cells.push([size - 1 - x, y]);
    }
  }
  const rects = cells.map(([x, y]) => `<rect x="${x * pixel + 8}" y="${y * pixel + 8}" width="${pixel}" height="${pixel}" rx="3" fill="hsl(${hue} 85% ${45 + ((x + y) % 2) * 10}%)" />`).join('');
  const eyes = `<rect x="22" y="24" width="10" height="10" rx="3" fill="white"/><rect x="48" y="24" width="10" height="10" rx="3" fill="white"/><rect x="25" y="27" width="4" height="4" rx="2" fill="hsl(${eyeHue} 90% 50%)"/><rect x="51" y="27" width="4" height="4" rx="2" fill="hsl(${eyeHue} 90% 50%)"/>`;
  const mouth = `<rect x="28" y="50" width="24" height="6" rx="3" fill="rgba(255,255,255,0.75)"/>`;
  const bg = `<rect width="86" height="86" rx="24" fill="rgba(11,11,24,0.88)"/><rect x="3" y="3" width="80" height="80" rx="21" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" />`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 86">${bg}${rects}${eyes}${mouth}</svg>`)}`;
}

function updateHeaderStats() {
  const today = document.getElementById('today-destroyed');
  const nickname = document.getElementById('nickname-display');
  if (today) today.textContent = state.todayDestroyed;
  if (nickname) nickname.textContent = state.nickname || 'Anon Furnace#0000';
}

// Rage meter, sound & combo -----------------------------------------------
function updateRageMeter() {
  const fill = document.querySelector('.rage-meter-fill') || document.querySelector('.rage-fill');
  if (fill) {
    const pct = Math.max(0, Math.min(consecutivePosts / 3, 1)) * 100;
    fill.style.width = `${pct}%`;
  }
  const text = document.querySelector('.rage-meter-label') || document.querySelector('.rage-text');
  if (text) {
    text.textContent = `Rage level: ${consecutivePosts}/3`;
  }
}

function playExplosionSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ac = new AudioCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.3);
    gain.gain.setValueAtTime(0.5, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.3);
    osc.start();
    osc.stop(ac.currentTime + 0.3);
  } catch (e) {
    // ignore audio errors in older browsers or restricted environments
  }
}

function showCombo(count) {
  if (count < 2) return;
  const el = document.getElementById('combo-counter') || document.getElementById('combo-banner');
  if (!el) return;
  el.textContent = `Combo x${count}! 🔥`;
  el.style.display = 'block';
  // restart animation
  el.style.animation = 'none';
  // force reflow
  // eslint-disable-next-line no-unused-expressions
  el.offsetHeight;
  el.style.animation = 'comboPopup 1s ease-out forwards';
  setTimeout(() => {
    el.style.display = 'none';
  }, 1200);
}

function renderCategoryButtons(rootId, activeCategory, onSelect, includeAll = false) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = '';
  const categories = includeAll ? ['All', ...state.validCategories] : state.validCategories;
  categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-chip${category === activeCategory ? ' is-active' : ''}`;
    const total = state.categoryTotals[category] || 0;
    button.innerHTML = `<span>${escapeHtml(category)}</span>${includeAll ? `<em>${total}</em>` : ''}`;
    button.addEventListener('click', () => onSelect(category));
    root.appendChild(button);
  });
}

function createLeaderboardItem(vent, index, likeHandler) {
  const container = document.createElement('article');
  container.className = 'leaderboard-item fade-in';
  const rank = index + 1;
  if (rank === 1) container.classList.add('rank-1');
  else if (rank === 2) container.classList.add('rank-2');
  else if (rank === 3) container.classList.add('rank-3');

  const monster = document.createElement('img');
  monster.className = 'monster-avatar';
  monster.alt = `${vent.nickname} pixel monster avatar`;
  monster.src = generateMonsterAvatar(vent.nickname || 'Anon Furnace');

  const main = document.createElement('div');
  main.className = 'leaderboard-main';

  const topRow = document.createElement('div');
  topRow.className = 'leaderboard-top';

  const badge = document.createElement('div');
  badge.className = 'rank-badge';
  badge.textContent = `#${rank}`;

  const identity = document.createElement('div');
  identity.className = 'vent-identity';
  identity.innerHTML = `<strong>${escapeHtml(vent.nickname || 'Anon Furnace')}</strong><span class="tag-pill">${escapeHtml(vent.category || 'Other')}</span>`;

  topRow.appendChild(badge);
  topRow.appendChild(identity);

  const content = document.createElement('div');
  content.className = 'vent-content';
  content.textContent = vent.content;

  main.appendChild(topRow);
  main.appendChild(content);

  const meta = document.createElement('div');
  meta.className = 'vent-meta';

  const timeSpan = document.createElement('span');
  timeSpan.textContent = formatDateTime(vent.created_at) || 'Just now';

  const likeBtn = document.createElement('button');
  likeBtn.className = 'like-button';
  likeBtn.type = 'button';
  likeBtn.innerHTML = '<span>⚡</span><span>Struck a nerve</span>';

  const countSpan = document.createElement('span');
  countSpan.className = 'like-count';
  countSpan.textContent = vent.likes;
  likeBtn.appendChild(countSpan);

  likeBtn.addEventListener('click', async () => {
    likeBtn.disabled = true;
    try {
      const updated = await likeHandler(vent.id);
      countSpan.textContent = updated.likes;
    } catch (err) {
      console.error(err);
    } finally {
      likeBtn.disabled = false;
    }
  });

  meta.appendChild(timeSpan);
  meta.appendChild(likeBtn);

  container.appendChild(monster);
  container.appendChild(main);
  container.appendChild(meta);
  return container;
}

function renderLeaderboardFromState() {
  const root = document.getElementById('leaderboard');
  if (!root) return;
  root.innerHTML = '';
  if (!state.vents.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = `No vents found under “${state.category}”.`;
    root.appendChild(empty);
    return;
  }
  const likeHandler = async (id) => {
    const { vent } = await api.likeVent(id);
    return vent;
  };
  state.vents.forEach((vent, index) => {
    const item = createLeaderboardItem(vent, index, likeHandler);
    item.style.animationDelay = `${index * 60}ms`;
    root.appendChild(item);
  });
}

// Legacy-style helpers for compatibility ----------------------------------
async function loadLeaderboard() {
  await refreshLeaderboard();
}

function renderLeaderboardItem(vent, index) {
  // Provide a basic wrapper so external callers can reuse the DOM rendering
  const noop = async () => vent;
  return createLeaderboardItem(vent, index, noop);
}

function applySnapshot(payload) {
  if (!payload) return;
  state.validCategories = payload.meta?.validCategories || state.validCategories;
  state.categoryTotals = { All: payload.meta?.totalDestroyed || 0, ...(payload.meta?.categoryTotals || {}) };
  state.todayDestroyed = payload.meta?.todayDestroyed || 0;
  state.vents = Array.isArray(payload.vents) ? payload.vents : [];
  updateHeaderStats();
  renderCategoryButtons('filter-toolbar', state.category, async (category) => {
    state.category = category;
    filterCategory = category;
    await refreshLeaderboard();
  }, true);
}

async function refreshLeaderboard() {
  const root = document.getElementById('leaderboard');
  if (!root) return;
  root.innerHTML = '';

  let data;
  try {
    data = await api.getVents(state.category);
  } catch (err) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty-state';
    errorDiv.textContent = 'Leaderboard is temporarily offline. Please try again later.';
    root.appendChild(errorDiv);
    return;
  }

  applySnapshot(data);
  renderLeaderboardFromState();
}

function triggerScreenShake() {
  document.body.classList.remove('screen-shake');
  void document.body.offsetWidth;
  document.body.classList.add('screen-shake');
  setTimeout(() => document.body.classList.remove('screen-shake'), 420);
}

function updateStreakBanner() {
  const banner = document.getElementById('streak-banner');
  if (!banner) return;
  const current = state.destroyStreak % 3;
  banner.textContent = `Consecutive destroys ${current} / 3`;
}

function triggerRageMode() {
  document.body.classList.add('rage-mode');
  const overlay = document.getElementById('rage-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
  spawnExplosion(window.innerWidth / 2, window.innerHeight / 2);
  triggerScreenShake();
  playExplosionSound();
  setTimeout(() => {
    document.body.classList.remove('rage-mode');
    if (overlay) {
      overlay.style.display = 'none';
    }
    consecutivePosts = 0;
    updateRageMeter();
  }, 5000);
}

function setupDestroyFlow() {
  const textarea = document.getElementById('vent-input');
  const button = document.getElementById('destroy-btn');
  const animationLayer = document.getElementById('destroy-animation');
  const errorEl = document.getElementById('vent-error');
  const counter = document.getElementById('char-counter');

  if (!textarea || !button) return;

  const max = Number(textarea.getAttribute('maxlength')) || 500;

  const updateCounter = () => {
    const len = textarea.value.length;
    counter.textContent = `${len} / ${max}`;
  };

  textarea.addEventListener('input', () => {
    updateCounter();
    errorEl.textContent = '';
  });

  document.querySelectorAll('.quick-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      textarea.value = (textarea.value ? `${textarea.value} ` : '') + chip.dataset.template;
      textarea.focus();
      updateCounter();
    });
  });

  updateCounter();
  updateRageMeter();

  const triggerAnimation = () => {
    if (!animationLayer) return;
    animationLayer.classList.remove('is-active');
    void animationLayer.offsetWidth;
    animationLayer.classList.add('is-active');
    const rect = button.getBoundingClientRect();
    spawnExplosion(rect.left + rect.width / 2, rect.top);
  };

  async function handleVent() {
    const raw = textarea.value.trim();
    errorEl.textContent = '';

    if (!raw) {
      errorEl.textContent = 'Write something first, then hand it to the furnace.';
      return;
    }

    button.disabled = true;
    textarea.disabled = true;

    try {
      triggerAnimation();
      triggerScreenShake();
      await api.createVent(raw, selectedCategory || state.composeCategory || 'Other', myNickname);
      textarea.value = '';
      updateCounter();
      consecutivePosts += 1;
      updateRageMeter();
      showCombo(consecutivePosts);
      if (consecutivePosts >= 3) {
        triggerRageMode();
      }
      rotatePlaceholder();
      await refreshLeaderboard();
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message || 'Submission failed. Please try again later.';
    } finally {
      button.disabled = false;
      textarea.disabled = false;
    }
  }

  button.addEventListener('click', async () => {
    handleVent();
  });
}

function setupRealtime() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.wsConnected = true;
  });

  ws.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if ((message.type === 'hello' || message.type === 'vents:update') && message.payload) {
        if (state.category !== 'All') {
          refreshLeaderboard();
        } else {
          applySnapshot(message.payload);
          renderLeaderboardFromState();
        }
      } else if (message.type === 'daily_count' && message.payload) {
        const count = typeof message.payload.count === 'number' ? message.payload.count : message.payload.todayDestroyed;
        if (typeof count === 'number') {
          state.todayDestroyed = count;
          updateHeaderStats();
        }
      } else if (message.type === 'new_vent' && message.payload) {
        const vent = message.payload.vent || message.payload;
        if (vent) {
          if (state.category === 'All' || vent.category === state.category) {
            state.vents = [vent, ...(state.vents || [])];
            renderLeaderboardFromState();
          }
        }
      } else if (message.type === 'like_update' && message.payload) {
        const { id, likes } = message.payload;
        if (id != null && typeof likes === 'number' && Array.isArray(state.vents)) {
          const target = state.vents.find((v) => v.id === id);
          if (target) {
            target.likes = likes;
            renderLeaderboardFromState();
          }
        }
      }
    } catch (err) {
      console.error('ws message error', err);
    }
  });

  ws.addEventListener('close', () => {
    state.wsConnected = false;
    setTimeout(setupRealtime, 1500);
  });
}

async function bootstrap() {
  const profileData = await api.getProfile();
  state.validCategories = profileData.validCategories || state.validCategories;
  state.categoryTotals = Object.fromEntries(state.validCategories.map((category) => [category, 0]));
  state.categoryTotals.All = 0;
  state.nickname = myNickname;
  updateHeaderStats();

  const composeSelect = (category) => {
    state.composeCategory = category;
    selectedCategory = category;
    renderCategoryButtons('category-group', category, composeSelect, false);
  };
  composeSelect('Other');

  const filterSelect = async (category) => {
    state.category = category;
    filterCategory = category;
    renderCategoryButtons('filter-toolbar', category, filterSelect, true);
    await refreshLeaderboard();
  };
  renderCategoryButtons('filter-toolbar', state.category, filterSelect, true);

  setupDestroyFlow();
  await refreshLeaderboard();
  setupRealtime();
  rotatePlaceholder();
}

window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch((err) => {
    console.error(err);
  });
});
