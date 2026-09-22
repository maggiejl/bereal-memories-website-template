const cfg = window.BEREAL_CONFIG;
if (!cfg || !cfg.dataDir || !cfg.userId) {
  throw new Error(
    "Missing config.js — run `python3 setup.py` after placing your BeReal export in this folder.",
  );
}

const DATA_DIR = cfg.dataDir;
const USER_ID = cfg.userId;
const CONVERSATION_IDS = Array.isArray(cfg.conversationIds) ? cfg.conversationIds : [];
const ROTATION_STORAGE_KEY = "bereal-memories-rotations";

const VIEWS = ["memories", "comments", "realmojis", "chats", "profile"];

const state = {
  memories: [],
  comments: [],
  commentsByPost: new Map(),
  expandedCommentPosts: new Set(),
  user: null,
  realmojis: [],
  reactions: [],
  friends: [],
  personLabels: new Map(),
  conversations: [],
  activeChatId: null,
  rotations: loadRotations(),
  activeMemory: null,
};

const els = {
  boot: document.getElementById("boot"),
  title: document.getElementById("title"),
  subtitle: document.getElementById("subtitle"),
  grid: document.getElementById("grid"),
  search: document.getElementById("search"),
  yearFilter: document.getElementById("year-filter"),
  filterToggle: document.getElementById("filter-toggle"),
  filterPanel: document.getElementById("filter-panel"),
  captionOnly: document.getElementById("caption-only"),
  onTimeOnly: document.getElementById("on-time-only"),
  lateOnly: document.getElementById("late-only"),
  resultCount: document.getElementById("result-count"),
  detail: document.getElementById("detail"),
  detailBack: document.getElementById("detail-back"),
  detailFront: document.getElementById("detail-front"),
  detailDate: document.getElementById("detail-date"),
  detailCaption: document.getElementById("detail-caption"),
  detailTaken: document.getElementById("detail-taken"),
  detailMoment: document.getElementById("detail-moment"),
  detailLate: document.getElementById("detail-late"),
  detailRetakes: document.getElementById("detail-retakes"),
  detailCommentsNote: document.getElementById("detail-comments-note"),
  detailCommentsList: document.getElementById("detail-comments-list"),
  commentSearch: document.getElementById("comment-search"),
  commentResultCount: document.getElementById("comment-result-count"),
  commentGroups: document.getElementById("comment-groups"),
  realmojiGrid: document.getElementById("realmoji-grid"),
  reactionGrid: document.getElementById("reaction-grid"),
  reactionCount: document.getElementById("reaction-count"),
  friendSearch: document.getElementById("friend-search"),
  friendSort: document.getElementById("friend-sort"),
  friendResultCount: document.getElementById("friend-result-count"),
  friendsList: document.getElementById("friends-list"),
  chatStats: document.getElementById("chat-stats"),
  chatShell: document.getElementById("chat-shell"),
  chatThreads: document.getElementById("chat-threads"),
  chatPane: document.getElementById("chat-pane"),
  chatPaneHead: document.getElementById("chat-pane-head"),
  chatEmpty: document.getElementById("chat-empty"),
  chatMessages: document.getElementById("chat-messages"),
  profileHero: document.getElementById("profile-hero"),
  profileFacts: document.getElementById("profile-facts"),
  views: Object.fromEntries(VIEWS.map((v) => [v, document.getElementById(`view-${v}`)])),
};

function loadRotations() {
  try {
    const raw = localStorage.getItem(ROTATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRotations() {
  try {
    localStorage.setItem(ROTATION_STORAGE_KEY, JSON.stringify(state.rotations));
  } catch {
    // Ignore quota / private mode errors
  }
}

function rotationKey(memory, side) {
  return `${memory.index}:${side}`;
}

function getRotation(memory, side) {
  return Number(state.rotations[rotationKey(memory, side)] || 0) % 360;
}

function applyImageRotation(img, degrees, { fitSideways = false, clockwiseStep = null } = {}) {
  const deg = ((Number(degrees) % 360) + 360) % 360;
  const sideways = deg % 180 !== 0;
  const visual =
    clockwiseStep != null
      ? Number(img.dataset.visualRotation || 0) + clockwiseStep
      : deg;

  img.dataset.rotation = String(deg);
  img.dataset.visualRotation = String(visual);
  img.classList.toggle("is-sideways", sideways);

  const wrap = img.closest(".card-front-wrap");
  if (wrap) wrap.classList.toggle("is-sideways", sideways);

  const rotate = `rotate(${visual}deg)`;
  if (fitSideways && sideways) {
    img.style.transform = `${rotate} scale(var(--sideways-scale, 0.75))`;
  } else {
    img.style.transform = rotate;
  }
}

function snapImageRotation(img, degrees, options) {
  const previous = img.style.transition;
  img.style.transition = "none";
  applyImageRotation(img, degrees, options);
  void img.offsetWidth;
  img.style.transition = previous;
}

function setRotation(memory, side, degrees, { animateClockwise = false } = {}) {
  const deg = ((Number(degrees) % 360) + 360) % 360;
  const key = rotationKey(memory, side);
  if (deg === 0) {
    delete state.rotations[key];
  } else {
    state.rotations[key] = deg;
  }
  saveRotations();

  const detailOpts = {
    fitSideways: true,
    clockwiseStep: animateClockwise ? 90 : null,
  };
  if (side === "front") {
    applyImageRotation(els.detailFront, deg, detailOpts);
  } else {
    applyImageRotation(els.detailBack, deg, detailOpts);
  }

  const card = els.grid.querySelector(`.card[data-index="${memory.index}"]`);
  if (card) {
    const img = card.querySelector(side === "front" ? ".card-front" : ".card-back");
    if (img) applyImageRotation(img, deg);
  }
}

function rotateMemorySide(side) {
  const memory = state.activeMemory;
  if (!memory || side !== "front") return;
  const next = (getRotation(memory, side) + 90) % 360;
  setRotation(memory, side, next, { animateClockwise: true });
}

function mediaUrl(rawPath) {
  let p = String(rawPath || "").replace(/^\/+/, "");
  const prefix = `Photos/${USER_ID}/`;
  if (p.startsWith(prefix)) {
    p = `Photos/${p.slice(prefix.length)}`;
  }
  return `${DATA_DIR}/${p}`;
}

function formatDay(iso) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMessageTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function yearOf(iso) {
  return String(new Date(iso).getFullYear());
}

function cleanMessageText(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

async function loadJson(name) {
  const res = await fetch(`${DATA_DIR}/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json();
}

async function loadConversations() {
  const results = await Promise.all(
    CONVERSATION_IDS.map(async (id) => {
      try {
        const data = await loadJson(`conversations/${id}/chat_log.json`);
        const raw = data.messages || [];
        const participants = [
          ...new Set(raw.map((m) => m.userId).filter(Boolean)),
        ];
        const messages = [...raw]
          .filter((m) => cleanMessageText(m.message))
          .sort((a, b) =>
            String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
          );
        return {
          id: data.conversationId || id,
          createdAt: data.createdAt,
          participants,
          messages,
        };
      } catch {
        return null;
      }
    }),
  );
  return results
    .filter(Boolean)
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => {
      const aLast = a.messages.at(-1)?.createdAt || a.createdAt || "";
      const bLast = b.messages.at(-1)?.createdAt || b.createdAt || "";
      return String(bLast).localeCompare(String(aLast));
    });
}

function prepareMemories(raw, posts) {
  const postsByTaken = new Map(posts.map((p) => [p.takenAt, p]));

  return raw
    .map((m, index) => {
      const taken = m.takenTime || m.date;
      const post = postsByTaken.get(m.takenTime) || null;
      return {
        index,
        taken,
        date: m.date,
        berealMoment: m.berealMoment,
        isLate: Boolean(m.isLate),
        caption: (m.caption || "").trim(),
        frontUrl: mediaUrl(m.frontImage?.path),
        backUrl: mediaUrl(m.backImage?.path),
        retakeCounter: Number(post?.retakeCounter || 0),
        mediaIds: [
          filenameStem(m.frontImage?.path),
          filenameStem(m.backImage?.path),
        ].filter(Boolean),
      };
    })
    .sort((a, b) => String(b.taken).localeCompare(String(a.taken)));
}

function filenameStem(path) {
  if (!path) return null;
  const name = path.split("/").pop() || "";
  return name.replace(/\.(webp|jpe?g|png|mp4)$/i, "");
}

function groupComments(comments) {
  const map = new Map();
  for (const c of comments) {
    const id = c.postId || "unknown";
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(c.content || "");
  }
  return map;
}

function commentsForMemory(memory) {
  const found = [];
  for (const id of memory.mediaIds) {
    if (state.commentsByPost.has(id)) {
      found.push(...state.commentsByPost.get(id));
    }
  }
  return found;
}

function filteredMemories() {
  const q = els.search.value.trim().toLowerCase();
  const year = els.yearFilter.value;
  const captionOnly = els.captionOnly.checked;
  const onTimeOnly = els.onTimeOnly.checked;
  const lateOnly = els.lateOnly.checked;

  return state.memories.filter((m) => {
    if (year && yearOf(m.taken) !== year) return false;
    if (captionOnly && !m.caption) return false;
    if (onTimeOnly && m.isLate) return false;
    if (lateOnly && !m.isLate) return false;
    if (q && !m.caption.toLowerCase().includes(q)) return false;
    return true;
  });
}

function setFilterPanelOpen(open) {
  els.filterPanel.hidden = !open;
  els.filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function syncFilterToggleState() {
  const active =
    els.captionOnly.checked || els.onTimeOnly.checked || els.lateOnly.checked;
  els.filterToggle.classList.toggle("is-active", active);
}

function renderGrid() {
  const items = filteredMemories();
  els.resultCount.textContent = `${items.length} memories`;
  const frag = document.createDocumentFragment();

  for (const m of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.dataset.index = String(m.index);

    const back = document.createElement("img");
    back.className = "card-back";
    back.loading = "lazy";
    back.decoding = "async";
    back.alt = m.caption || `BeReal on ${formatDay(m.taken)}`;
    back.src = m.backUrl;

    const frontWrap = document.createElement("span");
    frontWrap.className = "card-front-wrap";

    const front = document.createElement("img");
    front.className = "card-front";
    front.loading = "lazy";
    front.decoding = "async";
    front.alt = "";
    front.src = m.frontUrl;
    frontWrap.append(front);

    const meta = document.createElement("span");
    meta.className = "card-meta";

    const date = document.createElement("span");
    date.className = "card-date";
    date.textContent = formatDay(m.taken);
    meta.append(date);

    if (m.caption) {
      const caption = document.createElement("span");
      caption.className = "card-caption";
      caption.textContent = m.caption;
      meta.append(caption);
    }

    btn.append(back, frontWrap, meta);
    applyImageRotation(front, getRotation(m, "front"));
    btn.addEventListener("click", () => openDetail(m));
    frag.append(btn);
  }

  els.grid.replaceChildren(frag);
}

function openDetail(memory) {
  state.activeMemory = memory;
  els.detailBack.src = memory.backUrl;
  els.detailFront.src = memory.frontUrl;
  snapImageRotation(els.detailFront, getRotation(memory, "front"), { fitSideways: true });
  els.detailDate.textContent = formatDay(memory.taken);
  els.detailCaption.textContent = memory.caption;
  els.detailTaken.textContent = formatTime(memory.taken);
  els.detailMoment.textContent = formatTime(memory.berealMoment);
  els.detailLate.textContent = memory.isLate ? "No" : "Yes";
  els.detailRetakes.textContent = String(memory.retakeCounter ?? 0);

  const linked = commentsForMemory(memory);
  els.detailCommentsList.replaceChildren();

  if (linked.length) {
    els.detailCommentsNote.textContent = "";
    for (const text of linked) {
      const li = document.createElement("li");
      li.textContent = text;
      els.detailCommentsList.append(li);
    }
  } else {
    els.detailCommentsNote.textContent = "No comments linked to this memory.";
  }

  if (typeof els.detail.showModal === "function") {
    els.detail.showModal();
  } else {
    els.detail.setAttribute("open", "");
  }

  document.body.style.overflow = "hidden";
  els.detail.scrollTop = 0;
}

function closeDetail() {
  state.activeMemory = null;
  document.body.style.overflow = "";
}

const COMMENT_PREVIEW_COUNT = 4;

function renderCommentGroups() {
  const q = els.commentSearch.value.trim().toLowerCase();
  const entries = [...state.commentsByPost.entries()]
    .map(([postId, texts]) => ({
      postId,
      texts: texts.filter((t) => !q || t.toLowerCase().includes(q)),
    }))
    .filter((g) => g.texts.length > 0)
    .sort((a, b) => b.texts.length - a.texts.length);

  const totalComments = entries.reduce((n, g) => n + g.texts.length, 0);
  els.commentResultCount.textContent = `${totalComments} comments · ${entries.length} posts`;

  const frag = document.createDocumentFragment();
  for (const group of entries) {
    const article = document.createElement("article");
    article.className = "comment-group";
    article.dataset.postId = group.postId;

    const h = document.createElement("h3");
    h.textContent = `post ${group.postId} · ${group.texts.length} comment${group.texts.length === 1 ? "" : "s"}`;

    const expandable = group.texts.length > COMMENT_PREVIEW_COUNT;
    const expanded = state.expandedCommentPosts.has(group.postId);

    const ul = document.createElement("ul");
    group.texts.forEach((text, index) => {
      const li = document.createElement("li");
      li.textContent = text;
      if (expandable && !expanded && index >= COMMENT_PREVIEW_COUNT) {
        li.hidden = true;
      }
      ul.append(li);
    });

    article.append(h, ul);

    if (expandable) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "comment-toggle";
      const hiddenCount = group.texts.length - COMMENT_PREVIEW_COUNT;
      toggle.textContent = expanded ? "Show less" : `Show ${hiddenCount} more`;
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      toggle.addEventListener("click", () => {
        const nextExpanded = !state.expandedCommentPosts.has(group.postId);
        if (nextExpanded) {
          state.expandedCommentPosts.add(group.postId);
        } else {
          state.expandedCommentPosts.delete(group.postId);
        }

        ul.querySelectorAll("li").forEach((li, index) => {
          li.hidden = !nextExpanded && index >= COMMENT_PREVIEW_COUNT;
        });
        toggle.textContent = nextExpanded ? "Show less" : `Show ${hiddenCount} more`;
        toggle.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
      });
      article.append(toggle);
    }

    frag.append(article);
  }
  els.commentGroups.replaceChildren(frag);
}

function renderRealmojis() {
  const savedFrag = document.createDocumentFragment();

  for (const rm of state.realmojis) {
    const figure = document.createElement("figure");
    figure.className = "realmoji-card";

    const img = document.createElement("img");
    img.src = mediaUrl(rm.media?.path);
    img.alt = `Realmoji ${rm.emoji || ""}`;
    img.loading = "lazy";
    img.decoding = "async";

    const caption = document.createElement("figcaption");
    const emoji = document.createElement("span");
    emoji.className = "realmoji-emoji";
    emoji.textContent = rm.emoji || "?";
    caption.append(emoji);

    figure.append(img, caption);
    savedFrag.append(figure);
  }

  els.realmojiGrid.replaceChildren(savedFrag);

  els.reactionCount.textContent = `(${state.reactions.length})`;
  const reactionFrag = document.createDocumentFragment();
  for (const rm of state.reactions) {
    const figure = document.createElement("figure");
    figure.className = "realmoji-card realmoji-card-compact";

    const img = document.createElement("img");
    img.src = `${DATA_DIR}/${rm.path}`;
    img.alt = "Reaction Realmoji";
    img.loading = "lazy";
    img.decoding = "async";

    figure.append(img);
    reactionFrag.append(figure);
  }
  els.reactionGrid.replaceChildren(reactionFrag);
}

function filteredFriends() {
  const q = els.friendSearch.value.trim().toLowerCase();
  const sort = els.friendSort.value;
  const friends = state.friends.filter((f) => {
    if (!q) return true;
    const hay = `${f.friendUsername || ""} ${f.friendFullname || ""}`.toLowerCase();
    return hay.includes(q);
  });

  friends.sort((a, b) => {
    if (sort === "date-newest") {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    }
    if (sort === "date-oldest") {
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    }
    const nameA = (a.friendFullname || a.friendUsername || "").toLowerCase();
    const nameB = (b.friendFullname || b.friendUsername || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return friends;
}

function renderFriends() {
  const friends = filteredFriends();
  els.friendResultCount.textContent = `${friends.length} friends`;

  const friendFrag = document.createDocumentFragment();
  for (const f of friends) {
    const row = document.createElement("article");
    row.className = "person-row";

    const name = document.createElement("div");
    name.className = "person-name";
    name.textContent = f.friendFullname || f.friendUsername || "Unknown";

    const handle = document.createElement("div");
    handle.className = "person-handle";
    handle.textContent = `@${f.friendUsername || "unknown"}`;

    const when = document.createElement("div");
    when.className = "person-meta";
    when.textContent = `Friends since ${formatDay(f.createdAt)}`;

    row.append(name, handle, when);
    friendFrag.append(row);
  }
  els.friendsList.replaceChildren(friendFrag);
}

function buildPersonLabels(conversations) {
  const labels = new Map();
  let n = 0;
  for (const chat of conversations) {
    for (const id of chatOthersFromData(chat)) {
      if (labels.has(id)) continue;
      n += 1;
      labels.set(id, `Person ${n}`);
    }
  }
  return labels;
}

function personLabel(id) {
  if (!id || id === USER_ID) return "You";
  return state.personLabels.get(id) || "Someone";
}

function personInitials(id) {
  const label = personLabel(id);
  const match = label.match(/(\d+)/);
  return match ? `P${match[1]}` : "P";
}

function avatarTone(id) {
  let hash = 0;
  for (const ch of String(id || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 6;
}

function isNarrowChat() {
  return window.matchMedia("(max-width: 960px)").matches;
}

function syncChatShell() {
  els.chatShell.classList.toggle("is-open", Boolean(state.activeChatId));
}

function closeActiveChat() {
  state.activeChatId = null;
  renderChatThreads();
  renderChatMessages();
}

function chatOthersFromData(conversation) {
  const ids = conversation.participants?.length
    ? conversation.participants
    : conversation.messages.map((m) => m.userId);
  const others = [...new Set(ids.filter((id) => id && id !== USER_ID))];
  // Export only includes senders — if nobody else wrote, still treat as a DM.
  if (others.length) return others;
  return [`chat:${conversation.id}`];
}

function chatOthers(conversation) {
  return chatOthersFromData(conversation);
}

function chatTitle(conversation) {
  const others = chatOthers(conversation);
  if (others.length === 1) return personLabel(others[0]);
  return others.map((id) => personLabel(id)).join(", ");
}

function chatSubtitle(conversation) {
  const n = conversation.messages.length;
  const when = formatDay(conversation.createdAt);
  return `${n} message${n === 1 ? "" : "s"} · started ${when}`;
}

function chatPreview(conversation) {
  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    const text = cleanMessageText(conversation.messages[i].message);
    if (text) return text;
  }
  return "No messages";
}

function lastMessageAt(conversation) {
  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    if (conversation.messages[i].createdAt) return conversation.messages[i].createdAt;
  }
  return conversation.createdAt;
}

function formatChatListTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function makeChatAvatar(ids, sizeClass = "") {
  const wrap = document.createElement("div");
  wrap.className = `chat-avatar ${sizeClass}`.trim();
  const primary = ids[0] || "chat";
  wrap.dataset.tone = String(avatarTone(primary));

  if (ids.length > 1) {
    wrap.classList.add("is-group");
    wrap.textContent = String(ids.length);
  } else {
    wrap.textContent = personInitials(primary);
  }
  return wrap;
}

function renderChatThreads() {
  const totalMsgs = state.conversations.reduce((n, c) => n + c.messages.length, 0);
  els.chatStats.textContent = `${state.conversations.length} chats · ${totalMsgs} messages`;

  const frag = document.createDocumentFragment();
  for (const chat of state.conversations) {
    const others = chatOthers(chat);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-thread";
    if (chat.id === state.activeChatId) btn.classList.add("is-active");

    const avatar = makeChatAvatar(others.length ? others : [chat.id]);

    const body = document.createElement("div");
    body.className = "chat-thread-body";

    const top = document.createElement("div");
    top.className = "chat-thread-top";

    const title = document.createElement("div");
    title.className = "chat-thread-title";
    title.textContent = chatTitle(chat);

    const time = document.createElement("time");
    time.className = "chat-thread-time";
    time.textContent = formatChatListTime(lastMessageAt(chat));

    top.append(title, time);

    const preview = document.createElement("div");
    preview.className = "chat-thread-preview";
    preview.textContent = chatPreview(chat);

    body.append(top, preview);
    btn.append(avatar, body);
    btn.addEventListener("click", () => {
      state.activeChatId = chat.id;
      renderChatThreads();
      renderChatMessages();
    });
    frag.append(btn);
  }
  els.chatThreads.replaceChildren(frag);
}

function renderChatPaneHead(chat) {
  const others = chatOthers(chat);
  els.chatPaneHead.replaceChildren();

  const back = document.createElement("button");
  back.type = "button";
  back.className = "chat-back";
  back.setAttribute("aria-label", "Back to chats");
  back.textContent = "←";
  back.addEventListener("click", closeActiveChat);

  const avatar = makeChatAvatar(others.length ? others : [chat.id], "is-lg");

  const text = document.createElement("div");
  text.className = "chat-pane-head-text";

  const title = document.createElement("h3");
  title.className = "chat-pane-title";
  title.textContent = chatTitle(chat);

  const sub = document.createElement("p");
  sub.className = "chat-pane-sub";
  sub.textContent = chatSubtitle(chat);

  text.append(title, sub);
  els.chatPaneHead.append(back, avatar, text);
}

function renderChatMessages() {
  const chat = state.conversations.find((c) => c.id === state.activeChatId);
  syncChatShell();

  if (!chat) {
    els.chatEmpty.classList.remove("is-hidden");
    els.chatPaneHead.classList.add("is-hidden");
    els.chatMessages.classList.add("is-hidden");
    els.chatPane.classList.remove("has-chat");
    els.chatMessages.replaceChildren();
    els.chatPaneHead.replaceChildren();
    return;
  }

  els.chatEmpty.classList.add("is-hidden");
  els.chatPaneHead.classList.remove("is-hidden");
  els.chatMessages.classList.remove("is-hidden");
  els.chatPane.classList.add("has-chat");
  renderChatPaneHead(chat);

  const frag = document.createDocumentFragment();
  let lastDay = null;

  for (const msg of chat.messages) {
    const text = cleanMessageText(msg.message);
    if (!text) continue;

    const key = dayKey(msg.createdAt);
    if (key && key !== lastDay) {
      lastDay = key;
      const sep = document.createElement("div");
      sep.className = "chat-day-sep";
      sep.textContent = formatDay(msg.createdAt);
      frag.append(sep);
    }

    const row = document.createElement("div");
    const mine = msg.userId === USER_ID;
    row.className = `chat-row ${mine ? "is-mine" : "is-theirs"}`;

    if (!mine) {
      row.append(makeChatAvatar([msg.userId || "x"], "is-sm"));
    }

    const bubble = document.createElement("article");
    bubble.className = `chat-bubble ${mine ? "is-mine" : "is-theirs"}`;

    const body = document.createElement("p");
    body.className = "chat-bubble-text";
    body.textContent = text;

    const meta = document.createElement("div");
    meta.className = "chat-bubble-meta";
    const who = mine ? "You" : personLabel(msg.userId);
    meta.textContent = `${who} · ${formatMessageTime(msg.createdAt)}`;

    bubble.append(body, meta);
    row.append(bubble);
    frag.append(row);
  }

  els.chatMessages.replaceChildren(frag);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function addFact(container, label, value) {
  if (value == null || value === "") return;
  const row = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = String(value);
  row.append(dt, dd);
  container.append(row);
}

function renderProfile() {
  const user = state.user || {};
  els.profileHero.replaceChildren();

  const img = document.createElement("img");
  img.className = "profile-avatar";
  img.alt = `${user.fullname || user.username || "Profile"} photo`;
  img.src = mediaUrl(user.profilePicture?.path);

  const info = document.createElement("div");
  const name = document.createElement("h2");
  name.className = "profile-name";
  name.textContent = user.fullname || user.username || "Profile";
  const handle = document.createElement("p");
  handle.className = "profile-handle";
  handle.textContent = `@${user.username || "unknown"}`;
  info.append(name, handle);

  els.profileHero.append(img, info);

  els.profileFacts.replaceChildren();
  addFact(els.profileFacts, "Joined", formatTime(user.createdAt));
  addFact(els.profileFacts, "Timezone", user.timezone);
}

function populateYears() {
  const years = [...new Set(state.memories.map((m) => yearOf(m.taken)))].sort(
    (a, b) => Number(b) - Number(a),
  );
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    els.yearFilter.append(opt);
  }
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const view = tab.dataset.view;
      for (const name of VIEWS) {
        els.views[name]?.classList.toggle("is-hidden", name !== view);
      }
    });
  });
}

function setupFilters() {
  for (const el of [els.search, els.yearFilter]) {
    el.addEventListener("input", renderGrid);
    el.addEventListener("change", renderGrid);
  }

  els.filterToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setFilterPanelOpen(els.filterPanel.hidden);
  });

  for (const el of [els.captionOnly, els.onTimeOnly, els.lateOnly]) {
    el.addEventListener("change", () => {
      syncFilterToggleState();
      renderGrid();
    });
  }

  document.addEventListener("click", (e) => {
    if (!els.filterPanel.hidden && !e.target.closest(".filter-menu")) {
      setFilterPanelOpen(false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.filterPanel.hidden) {
      setFilterPanelOpen(false);
      els.filterToggle.focus();
    }
  });

  els.commentSearch.addEventListener("input", renderCommentGroups);
  els.friendSearch.addEventListener("input", renderFriends);
  els.friendSort.addEventListener("change", renderFriends);
  els.detail.addEventListener("close", closeDetail);
  els.detail.querySelectorAll("[data-rotate]").forEach((btn) => {
    btn.addEventListener("click", () => rotateMemorySide(btn.dataset.rotate));
  });
}

async function main() {
  try {
    const [user, memoriesRaw, posts, comments, realmojis, reactions, friends, conversations] =
      await Promise.all([
        loadJson("user.json"),
        loadJson("memories.json"),
        loadJson("posts.json"),
        loadJson("comments.json"),
        loadJson("realmojis.json"),
        loadJson("reaction-realmojis.json"),
        loadJson("friends.json"),
        loadConversations(),
      ]);

    state.user = user;
    state.memories = prepareMemories(memoriesRaw, posts);
    state.comments = comments;
    state.commentsByPost = groupComments(comments);
    state.realmojis = realmojis;
    state.reactions = reactions;
    state.friends = friends;
    state.conversations = conversations;
    state.personLabels = buildPersonLabels(conversations);
    if (conversations.length && !isNarrowChat()) {
      state.activeChatId = conversations[0].id;
    }

    els.title.textContent = `${user.fullname || user.username}'s memories`;
    els.subtitle.textContent = `@${user.username} · ${state.memories.length} memories`;

    populateYears();
    setupTabs();
    setupFilters();
    renderGrid();
    renderCommentGroups();
    renderRealmojis();
    renderFriends();
    renderChatThreads();
    renderChatMessages();
    renderProfile();
    els.boot.classList.add("is-done");
  } catch (err) {
    console.error(err);
    els.boot.innerHTML = `
      <p><strong>Could not load export data.</strong></p>
      <p class="boot-hint">${String(err.message || err)}</p>
      <p class="boot-hint">Run <code>python3 setup.py</code>, then from this folder:<br><code>python3 -m http.server 8000</code><br>and open <code>http://localhost:8000</code></p>
    `;
  }
}

main();
