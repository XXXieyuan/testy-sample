const ventForm = document.getElementById('ventForm');
const ventInput = document.getElementById('ventInput');
const charCount = document.getElementById('charCount');
const statusText = document.getElementById('statusText');
const destroyButton = document.getElementById('destroyButton');
const forgeMessage = document.getElementById('forgeMessage');
const shardLayer = document.getElementById('shardLayer');
const leaderboard = document.getElementById('leaderboard');
const template = document.getElementById('ventCardTemplate');
const ventCount = document.getElementById('ventCount');
const totalLikes = document.getElementById('totalLikes');

const formatDate = (input) => {
  const date = new Date(input);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const setStatus = (message) => {
  statusText.textContent = message;
};

const updateCharCount = () => {
  charCount.textContent = `${ventInput.value.length} / 500`;
};

const createShards = (text) => {
  shardLayer.innerHTML = '';
  const total = Math.min(26, Math.max(12, Math.ceil(text.length / 8)));

  for (let i = 0; i < total; i += 1) {
    const shard = document.createElement('span');
    shard.className = 'shard';
    shard.style.setProperty('--x', `${(Math.random() - 0.5) * 280}px`);
    shard.style.setProperty('--y', `${(Math.random() - 0.5) * 220}px`);
    shard.style.setProperty('--r', `${Math.random() * 540 - 270}deg`);
    shard.style.animationDelay = `${Math.random() * 120}ms`;
    shardLayer.appendChild(shard);
  }
};

const renderLeaderboard = (vents) => {
  ventCount.textContent = vents.length;
  totalLikes.textContent = vents.reduce((sum, vent) => sum + vent.likes, 0);

  if (!vents.length) {
    leaderboard.innerHTML = '<div class="empty-state">排行榜还是空的。先扔进第一条吐槽吧。</div>';
    return;
  }

  leaderboard.innerHTML = '';
  vents.forEach((vent, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.vent-rank').textContent = `#${index + 1}`;
    node.querySelector('.vent-content').textContent = vent.content;
    node.querySelector('.vent-date').textContent = formatDate(vent.created_at);
    node.querySelector('.like-count').textContent = vent.likes;

    const button = node.querySelector('.like-button');
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch(`/api/vents/${vent.id}/like`, { method: 'POST' });
        if (!response.ok) {
          throw new Error('点赞失败');
        }
        await loadVents();
      } catch (error) {
        console.error(error);
        setStatus('点赞失败，请稍后再试');
      } finally {
        button.disabled = false;
      }
    });

    leaderboard.appendChild(node);
  });
};

const loadVents = async () => {
  const response = await fetch('/api/vents');
  const data = await response.json();
  renderLeaderboard(data);
};

ventForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = ventInput.value.trim();

  if (!content) {
    setStatus('先写点什么，再销毁。');
    return;
  }

  destroyButton.disabled = true;
  setStatus('焚化炉升温中……');
  forgeMessage.textContent = `「${content.slice(0, 120)}${content.length > 120 ? '…' : ''}」`;
  createShards(content);

  await new Promise((resolve) => setTimeout(resolve, 950));

  try {
    const response = await fetch('/api/vents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || '提交失败');
    }

    forgeMessage.textContent = '已销毁。灰烬已进入排行榜。';
    ventInput.value = '';
    updateCharCount();
    setStatus('销毁完成');
    await loadVents();
  } catch (error) {
    console.error(error);
    forgeMessage.textContent = '销毁失败，焚化炉卡住了。';
    setStatus(error.message || '提交失败');
  } finally {
    destroyButton.disabled = false;
    setTimeout(() => {
      shardLayer.innerHTML = '';
    }, 300);
  }
});

ventInput.addEventListener('input', updateCharCount);

updateCharCount();
loadVents().catch((error) => {
  console.error(error);
  setStatus('加载排行榜失败');
});
