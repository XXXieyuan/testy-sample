const state = {
  vents: [],
  category: '全部',
  composeCategory: '其他',
  validCategories: ['老板', '学校', '生活', '感情', '其他'],
  todayDestroyed: 0,
  categoryTotals: {},
  nickname: '',
  avatarSeed: '',
  destroyStreak: 0,
  ws: null,
  wsConnected: false,
};

const api = {
  async getProfile() {
    const res = await fetch('/api/profile');
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
  },
  async getVents(category = '全部') {
    const query = category && category !== '全部' ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`/api/vents${query}`);
    if (!res.ok) throw new Error('Failed to fetch vents');
    return res.json();
  },
  async createVent(content, category) {
    const res = await fetch('/api/vents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category }),
    });
    const data = await res.json();
    if (!res.ok) {
      const message = data && data.error ? data.error : '创建失败';
      throw new Error(message);
    }
    return data;
  },
  async likeVent(id) {
    const res = await fetch(`/api/vents/${id}/like`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data && data.error ? data.error : '点赞失败');
    }
    return data;
  },
};

function formatDateTime(isoLike) {
  if (!isoLike) return '';
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
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
  if (nickname) nickname.textContent = state.nickname || '匿名熔炉者#0000';
}

function renderCategoryButtons(rootId, activeCategory, onSelect, includeAll = false) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = '';
  const categories = includeAll ? ['全部', ...state.validCategories] : state.validCategories;
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
  monster.alt = `${vent.nickname} 的像素怪物头像`;
  monster.src = createMonsterSvg(vent.avatar_seed || vent.nickname || vent.id);

  const main = document.createElement('div');
  main.className = 'leaderboard-main';

  const topRow = document.createElement('div');
  topRow.className = 'leaderboard-top';

  const badge = document.createElement('div');
  badge.className = 'rank-badge';
  badge.textContent = `#${rank}`;

  const identity = document.createElement('div');
  identity.className = 'vent-identity';
  identity.innerHTML = `<strong>${escapeHtml(vent.nickname || '匿名熔炉者')}</strong><span class="tag-pill">${escapeHtml(vent.category || '其他')}</span>`;

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
  timeSpan.textContent = formatDateTime(vent.created_at) || '刚刚';

  const likeBtn = document.createElement('button');
  likeBtn.className = 'like-button';
  likeBtn.type = 'button';
  likeBtn.innerHTML = '<span>⚡</span><span>击中要害</span>';

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
    empty.textContent = `「${state.category}」标签下还没有任何吐槽。`;
    root.appendChild(empty);
    return;
  }
  const likeHandler = async (id) => {
    const { vent } = await api.likeVent(id);
    return vent;
  };
  state.vents.forEach((vent, index) => {
    const item = createLeaderboardItem(vent, index, likeHandler);
    item.style.animationDelay = `${index * 40}ms`;
    root.appendChild(item);
  });
}

function applySnapshot(payload) {
  if (!payload) return;
  state.validCategories = payload.meta?.validCategories || state.validCategories;
  state.categoryTotals = { 全部: payload.meta?.totalDestroyed || 0, ...(payload.meta?.categoryTotals || {}) };
  state.todayDestroyed = payload.meta?.todayDestroyed || 0;
  state.vents = Array.isArray(payload.vents) ? payload.vents : [];
  updateHeaderStats();
  renderCategoryButtons('filter-toolbar', state.category, async (category) => {
    state.category = category;
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
    errorDiv.textContent = '排行榜暂时离线，请稍后再试。';
    root.appendChild(errorDiv);
    return;
  }

  applySnapshot(data);
  renderLeaderboardFromState();
}

function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  return ratio;
}

function burstParticles({ x, y, color = '#ff4d6d', count = 24, spread = 2.5 }) {
  const canvas = document.getElementById('fx-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ratio = resizeCanvas(canvas);
  let particles = Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.6;
    const speed = 2 + Math.random() * spread;
    return {
      x: x * ratio,
      y: y * ratio,
      vx: Math.cos(angle) * speed * ratio,
      vy: Math.sin(angle) * speed * ratio,
      life: 40 + Math.random() * 30,
      size: (2 + Math.random() * 4) * ratio,
      color,
    };
  });

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter((particle) => particle.life > 0);
    particles.forEach((particle) => {
      particle.life -= 1;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.08 * ratio;
      ctx.globalAlpha = Math.max(particle.life / 70, 0);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    if (particles.length) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  requestAnimationFrame(frame);
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
  banner.textContent = `连续销毁 ${current} / 3`;
}

function triggerRageMode() {
  document.body.classList.add('rage-mode');
  for (let i = 0; i < 4; i += 1) {
    burstParticles({ x: window.innerWidth * (0.2 + i * 0.2), y: window.innerHeight * 0.35, color: '#ff2d55', count: 34, spread: 3.8 });
  }
  setTimeout(() => document.body.classList.remove('rage-mode'), 1800);
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
  updateStreakBanner();

  const triggerAnimation = () => {
    if (!animationLayer) return;
    animationLayer.classList.remove('is-active');
    void animationLayer.offsetWidth;
    animationLayer.classList.add('is-active');
    const rect = button.getBoundingClientRect();
    burstParticles({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color: '#ff7a18', count: 42, spread: 4.5 });
  };

  button.addEventListener('click', async () => {
    const raw = textarea.value.trim();
    errorEl.textContent = '';

    if (!raw) {
      errorEl.textContent = '先写点什么，再交给熔炉。';
      return;
    }

    button.disabled = true;
    textarea.disabled = true;

    try {
      triggerAnimation();
      triggerScreenShake();
      await api.createVent(raw, state.composeCategory || '其他');
      textarea.value = '';
      updateCounter();
      state.destroyStreak += 1;
      updateStreakBanner();
      if (state.destroyStreak % 3 === 0) {
        triggerRageMode();
      }
      await refreshLeaderboard();
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message || '提交失败，请稍后重试。';
    } finally {
      button.disabled = false;
      textarea.disabled = false;
    }
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
        if (state.category !== '全部') {
          refreshLeaderboard();
        } else {
          applySnapshot(message.payload);
          renderLeaderboardFromState();
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
  state.nickname = profileData.profile.nickname;
  state.avatarSeed = profileData.profile.avatarSeed;
  state.validCategories = profileData.validCategories || state.validCategories;
  state.categoryTotals = Object.fromEntries(state.validCategories.map((category) => [category, 0]));
  state.categoryTotals.全部 = 0;
  updateHeaderStats();

  const composeSelect = (category) => {
    state.composeCategory = category;
    renderCategoryButtons('category-group', category, composeSelect, false);
  };
  composeSelect('其他');

  const filterSelect = async (category) => {
    state.category = category;
    renderCategoryButtons('filter-toolbar', category, filterSelect, true);
    await refreshLeaderboard();
  };
  renderCategoryButtons('filter-toolbar', state.category, filterSelect, true);

  setupDestroyFlow();
  await refreshLeaderboard();
  setupRealtime();
}

window.addEventListener('resize', () => {
  const canvas = document.getElementById('fx-canvas');
  if (canvas) resizeCanvas(canvas);
});

window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch((err) => {
    console.error(err);
  });
});
