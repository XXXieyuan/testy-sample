const api = {
  async getVents() {
    const res = await fetch('/api/vents');
    if (!res.ok) throw new Error('Failed to fetch vents');
    return res.json();
  },
  async createVent(content) {
    const res = await fetch('/api/vents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
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

function createLeaderboardItem(vent, index, likeHandler) {
  const container = document.createElement('article');
  container.className = 'leaderboard-item';
  const rank = index + 1;
  if (rank === 1) container.classList.add('rank-1');
  else if (rank === 2) container.classList.add('rank-2');
  else if (rank === 3) container.classList.add('rank-3');

  const main = document.createElement('div');
  main.className = 'leaderboard-main';

  const badge = document.createElement('div');
  badge.className = 'rank-badge';
  badge.textContent = `#${rank}`;

  const content = document.createElement('div');
  content.className = 'vent-content';
  content.textContent = vent.content;

  main.appendChild(badge);
  main.appendChild(content);

  const meta = document.createElement('div');
  meta.className = 'vent-meta';

  const timeSpan = document.createElement('span');
  timeSpan.textContent = formatDateTime(vent.created_at) || '刚刚';

  const likeBtn = document.createElement('button');
  likeBtn.className = 'like-button';
  likeBtn.type = 'button';

  const iconSpan = document.createElement('span');
  iconSpan.textContent = '⚡';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = '击中要害';

  const countSpan = document.createElement('span');
  countSpan.className = 'like-count';
  countSpan.textContent = vent.likes;

  likeBtn.appendChild(iconSpan);
  likeBtn.appendChild(labelSpan);
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

  container.appendChild(main);
  container.appendChild(meta);

  return container;
}

async function refreshLeaderboard() {
  const root = document.getElementById('leaderboard');
  if (!root) return;
  root.innerHTML = '';

  let data;
  try {
    data = await api.getVents();
  } catch (err) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'empty-state';
    errorDiv.textContent = '排行榜暂时离线，请稍后再试。';
    root.appendChild(errorDiv);
    return;
  }

  const vents = Array.isArray(data.vents) ? data.vents : [];
  if (vents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '还没有任何吐槽。成为第一个点燃熔炉的人。';
    root.appendChild(empty);
    return;
  }

  const likeHandler = async (id) => {
    const { vent } = await api.likeVent(id);
    // After a like, re-fetch list so ordering stays by likes desc
    setTimeout(refreshLeaderboard, 120);
    return vent;
  };

  vents.forEach((vent, index) => {
    const item = createLeaderboardItem(vent, index, likeHandler);
    root.appendChild(item);
  });
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

  updateCounter();

  const triggerAnimation = () => {
    if (!animationLayer) return;
    animationLayer.classList.remove('is-active');
    void animationLayer.offsetWidth; // force reflow
    animationLayer.classList.add('is-active');
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
      await api.createVent(raw);
      textarea.value = '';
      updateCounter();
      setTimeout(refreshLeaderboard, 260);
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message || '提交失败，请稍后重试。';
    } finally {
      button.disabled = false;
      textarea.disabled = false;
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setupDestroyFlow();
  refreshLeaderboard();
});
