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

const GRID_MIN_COL_PX = 160;
const GRID_GAP_REM = 0.75;
const SECTION_GAP_REM = 1.75;
const HEADING_LINE_REM = 1.35;
const HEADING_MARGIN_REM = 0.85;
const VIRTUAL_OVERSCAN_ROWS = 3;

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
  lightboxSide: null,
};

const virtualFeed = {
  items: [],
  groupByMonth: false,
  entries: [],
  mounted: new Map(),
  root: null,
  cellH: 0,
  gap: 0,
  layoutWidth: 0,
  resizeObserver: null,
  raf: 0,
  relayoutRaf: 0,
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
  detailPrev: document.getElementById("detail-prev"),
  detailNext: document.getElementById("detail-next"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightbox-img"),
  lightboxClose: document.getElementById("lightbox-close"),
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

  if (state.lightboxSide === side && els.lightbox.open) {
    applyImageRotation(els.lightboxImg, deg, {
      clockwiseStep: animateClockwise ? 90 : null,
    });
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
  if (!rawPath) return "";
  let p = String(rawPath).replace(/^\/+/, "");
  if (!p) return "";
  const prefix = `Photos/${USER_ID}/`;
  if (p.startsWith(prefix)) {
    p = `Photos/${p.slice(prefix.length)}`;
  }
  return `${DATA_DIR}/${p}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyState(title, detail) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  const heading = document.createElement("p");
  heading.className = "empty-state-title";
  heading.textContent = title;
  wrap.append(heading);
  if (detail) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = detail;
    wrap.append(p);
  }
  return wrap;
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

function monthKey(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthName(iso) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, { month: "long" });
}

function groupMemoriesByMonth(items) {
  const groups = [];
  const byKey = new Map();
  for (const m of items) {
    const key = monthKey(m.taken);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: formatMonthName(m.taken), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(m);
  }
  return groups.sort((a, b) => a.key.localeCompare(b.key));
}

function displayMemories() {
  const items = filteredMemories();
  if (!els.yearFilter.value) return items;
  return [...items].sort((a, b) => String(a.taken).localeCompare(String(b.taken)));
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

async function loadJsonOptional(name, fallback = null) {
  try {
    return await loadJson(name);
  } catch (err) {
    console.warn(`Optional data missing or unreadable: ${name}`, err);
    return fallback;
  }
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

function remToPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function gridMetrics(width) {
  const gap = GRID_GAP_REM * remToPx();
  const cols = Math.max(1, Math.floor((width + gap) / (GRID_MIN_COL_PX + gap)));
  const cellW = (width - gap * (cols - 1)) / cols;
  const cellH = cellW * (4 / 3);
  return { cols, gap, cellW, cellH };
}

function buildVirtualEntries(items, groupByMonth, width) {
  const { cols, gap, cellW, cellH } = gridMetrics(width);
  const rem = remToPx();
  const sectionGap = SECTION_GAP_REM * rem;
  const headingH = HEADING_LINE_REM * rem;
  const headingMargin = HEADING_MARGIN_REM * rem;
  const entries = [];
  let y = 0;

  const pushCards = (list) => {
    if (!list.length) return;
    list.forEach((m, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      entries.push({
        key: `m-${m.index}`,
        kind: "card",
        memory: m,
        top: y + row * (cellH + gap),
        left: col * (cellW + gap),
        width: cellW,
        height: cellH,
      });
    });
    const rows = Math.ceil(list.length / cols);
    y += rows * cellH + (rows - 1) * gap;
  };

  if (!groupByMonth) {
    pushCards(items);
  } else {
    const groups = groupMemoriesByMonth(items);
    groups.forEach((group, gi) => {
      entries.push({
        key: `h-${group.key}`,
        kind: "heading",
        label: group.label,
        top: y,
        left: 0,
        width,
        height: headingH,
      });
      y += headingH + headingMargin;
      pushCards(group.items);
      if (gi < groups.length - 1) y += sectionGap;
    });
  }

  return { entries, totalHeight: Math.max(0, y), cellH, gap };
}

function firstVisibleEntryIndex(entries, viewTop) {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const e = entries[mid];
    if (e.top + e.height < viewTop) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function createMemoryCard(m, { lazy = true } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card";
  btn.dataset.index = String(m.index);

  const back = document.createElement("img");
  back.className = "card-back";
  back.loading = lazy ? "lazy" : "eager";
  back.decoding = "async";
  back.alt = m.caption || `BeReal on ${formatDay(m.taken)}`;
  if (m.backUrl) back.src = m.backUrl;

  const frontWrap = document.createElement("span");
  frontWrap.className = "card-front-wrap";

  const front = document.createElement("img");
  front.className = "card-front";
  front.loading = lazy ? "lazy" : "eager";
  front.decoding = "async";
  front.alt = "";
  if (m.frontUrl) front.src = m.frontUrl;
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
  return btn;
}

function mountVirtualEntry(entry) {
  if (entry.kind === "heading") {
    const h = document.createElement("h2");
    h.className = "section-heading virtual-feed-heading";
    h.textContent = entry.label;
    h.style.top = `${entry.top}px`;
    h.style.left = "0";
    h.style.width = `${entry.width}px`;
    h.style.height = `${entry.height}px`;
    return h;
  }

  const btn = createMemoryCard(entry.memory, { lazy: false });
  btn.classList.add("virtual-feed-card");
  btn.style.top = `${entry.top}px`;
  btn.style.left = `${entry.left}px`;
  btn.style.width = `${entry.width}px`;
  btn.style.height = `${entry.height}px`;
  return btn;
}

function unmountVirtualEntry(el) {
  el.querySelectorAll("img").forEach((img) => {
    img.removeAttribute("src");
  });
  el.remove();
}

function clearVirtualMounted() {
  for (const el of virtualFeed.mounted.values()) {
    unmountVirtualEntry(el);
  }
  virtualFeed.mounted.clear();
}

function disposeVirtualFeed() {
  window.removeEventListener("scroll", scheduleVirtualFeedSync);
  if (virtualFeed.resizeObserver) {
    virtualFeed.resizeObserver.disconnect();
    virtualFeed.resizeObserver = null;
  }
  if (virtualFeed.raf) {
    cancelAnimationFrame(virtualFeed.raf);
    virtualFeed.raf = 0;
  }
  if (virtualFeed.relayoutRaf) {
    cancelAnimationFrame(virtualFeed.relayoutRaf);
    virtualFeed.relayoutRaf = 0;
  }
  clearVirtualMounted();
  virtualFeed.root = null;
  virtualFeed.entries = [];
  virtualFeed.items = [];
  virtualFeed.layoutWidth = 0;
}

function syncVirtualFeedWindow() {
  const root = virtualFeed.root;
  if (!root || !virtualFeed.entries.length) return;

  const rect = root.getBoundingClientRect();
  const rowStride = virtualFeed.cellH + virtualFeed.gap;
  const overscan = VIRTUAL_OVERSCAN_ROWS * (rowStride > 0 ? rowStride : 200);
  const viewTop = -rect.top - overscan;
  const viewBottom = -rect.top + window.innerHeight + overscan;

  const start = firstVisibleEntryIndex(virtualFeed.entries, viewTop);
  const nextKeys = new Set();

  for (let i = start; i < virtualFeed.entries.length; i++) {
    const entry = virtualFeed.entries[i];
    if (entry.top > viewBottom) break;
    nextKeys.add(entry.key);
    if (!virtualFeed.mounted.has(entry.key)) {
      const el = mountVirtualEntry(entry);
      root.append(el);
      virtualFeed.mounted.set(entry.key, el);
    }
  }

  for (const [key, el] of virtualFeed.mounted) {
    if (!nextKeys.has(key)) {
      unmountVirtualEntry(el);
      virtualFeed.mounted.delete(key);
    }
  }
}

function scheduleVirtualFeedSync() {
  if (virtualFeed.raf) return;
  virtualFeed.raf = requestAnimationFrame(() => {
    virtualFeed.raf = 0;
    syncVirtualFeedWindow();
  });
}

function relayoutVirtualFeed({ force = false } = {}) {
  const root = virtualFeed.root;
  if (!root) return;

  const width =
    root.clientWidth ||
    els.grid.clientWidth ||
    els.views.memories?.clientWidth ||
    0;
  if (width <= 0) return;

  // Ignore sub-pixel / scrollbar noise so we don't tear down loading images
  if (!force && Math.abs(width - virtualFeed.layoutWidth) < 1) {
    syncVirtualFeedWindow();
    return;
  }

  const { entries, totalHeight, cellH, gap } = buildVirtualEntries(
    virtualFeed.items,
    virtualFeed.groupByMonth,
    width,
  );
  virtualFeed.entries = entries;
  virtualFeed.cellH = cellH;
  virtualFeed.gap = gap;
  virtualFeed.layoutWidth = width;
  root.style.height = `${totalHeight}px`;
  clearVirtualMounted();
  syncVirtualFeedWindow();
}

function scheduleVirtualFeedRelayout() {
  if (virtualFeed.relayoutRaf) return;
  virtualFeed.relayoutRaf = requestAnimationFrame(() => {
    virtualFeed.relayoutRaf = 0;
    relayoutVirtualFeed();
  });
}

function renderGrid() {
  const items = displayMemories();
  const groupByMonth = Boolean(els.yearFilter.value);
  els.resultCount.textContent = `${items.length} memories`;

  disposeVirtualFeed();

  if (!state.memories.length) {
    els.grid.replaceChildren(
      emptyState(
        "No memories found",
        "memories.json was missing, empty, or could not be read from your export.",
      ),
    );
    return;
  }

  if (!items.length) {
    els.grid.replaceChildren(
      emptyState("No matching memories", "Try clearing search or filters."),
    );
    return;
  }

  const root = document.createElement("div");
  root.className = "virtual-feed";
  els.grid.replaceChildren(root);

  virtualFeed.root = root;
  virtualFeed.items = items;
  virtualFeed.groupByMonth = groupByMonth;

  window.addEventListener("scroll", scheduleVirtualFeedSync, { passive: true });
  virtualFeed.resizeObserver = new ResizeObserver((entries) => {
    const next = entries[0]?.contentRect?.width ?? 0;
    if (next > 0 && Math.abs(next - virtualFeed.layoutWidth) >= 1) {
      scheduleVirtualFeedRelayout();
    }
  });
  virtualFeed.resizeObserver.observe(root);

  relayoutVirtualFeed({ force: true });
}

function activeMemoryIndex() {
  const items = displayMemories();
  if (!state.activeMemory) return { items, index: -1 };
  const index = items.findIndex((m) => m.index === state.activeMemory.index);
  return { items, index };
}

function setNavDisabled(btn, disabled) {
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");
}

function isNavDisabled(btn) {
  return btn.getAttribute("aria-disabled") === "true";
}

function updateDetailNav() {
  const { items, index } = activeMemoryIndex();
  const total = items.length;
  setNavDisabled(els.detailPrev, index <= 0);
  setNavDisabled(els.detailNext, index < 0 || index >= total - 1);
}

function clearDetailFocus() {
  const focused = document.activeElement;
  if (focused && focused !== els.detail && els.detail.contains(focused)) {
    focused.blur();
  }
  if (els.detail.open) {
    els.detail.focus({ preventScroll: true });
  }
}

function navigateDetail(delta) {
  if (!els.detail.open && !els.detail.hasAttribute("open")) return;
  if (els.lightbox.open || els.lightbox.hasAttribute("open")) return;
  const btn = delta < 0 ? els.detailPrev : els.detailNext;
  if (isNavDisabled(btn)) return;
  const { items, index } = activeMemoryIndex();
  const next = index + delta;
  if (next < 0 || next >= items.length) return;
  openDetail(items[next]);
  clearDetailFocus();
}

function openDetail(memory) {
  closeLightbox();
  state.activeMemory = memory;
  if (memory.backUrl) els.detailBack.src = memory.backUrl;
  else els.detailBack.removeAttribute("src");
  if (memory.frontUrl) els.detailFront.src = memory.frontUrl;
  else els.detailFront.removeAttribute("src");
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
  } else if (!state.comments.length) {
    els.detailCommentsNote.textContent = "No comments data found in this export.";
  } else {
    els.detailCommentsNote.textContent = "No comments linked to this memory.";
  }

  updateDetailNav();

  if (!els.detail.open) {
    if (typeof els.detail.showModal === "function") {
      els.detail.showModal();
    } else {
      els.detail.setAttribute("open", "");
    }
  }

  document.body.style.overflow = "hidden";
  els.detail.scrollTop = 0;
}

function closeDetail() {
  closeLightbox();
  state.activeMemory = null;
  document.body.style.overflow = "";
}

function openLightbox(side) {
  const memory = state.activeMemory;
  if (!memory) return;
  const src = side === "front" ? memory.frontUrl : memory.backUrl;
  if (!src) return;

  document.activeElement?.blur?.();
  state.lightboxSide = side;
  els.lightboxImg.src = src;
  els.lightboxImg.alt = side === "front" ? "Front camera" : "Back camera";
  snapImageRotation(els.lightboxImg, getRotation(memory, side));

  if (typeof els.lightbox.showModal === "function") {
    els.lightbox.showModal();
  } else {
    els.lightbox.setAttribute("open", "");
  }
}

function closeLightbox() {
  if (!els.lightbox.open && !els.lightbox.hasAttribute("open")) {
    state.lightboxSide = null;
    return;
  }
  if (typeof els.lightbox.close === "function") {
    els.lightbox.close();
  } else {
    els.lightbox.removeAttribute("open");
  }
  state.lightboxSide = null;
  els.lightboxImg.removeAttribute("src");
  els.lightboxImg.alt = "";
  els.lightboxImg.style.transform = "";
  els.lightboxImg.classList.remove("is-sideways");
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

  if (!state.comments.length) {
    els.commentGroups.replaceChildren(
      emptyState(
        "No comments found",
        "comments.json was missing, empty, or could not be read from your export.",
      ),
    );
    return;
  }

  if (!entries.length) {
    els.commentGroups.replaceChildren(
      emptyState("No matching comments", "Try a different search."),
    );
    return;
  }

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
  if (!state.realmojis.length) {
    els.realmojiGrid.replaceChildren(
      emptyState(
        "No saved Realmojis",
        "realmojis.json was missing, empty, or could not be read from your export.",
      ),
    );
  } else {
    const savedFrag = document.createDocumentFragment();
    for (const rm of state.realmojis) {
      const figure = document.createElement("figure");
      figure.className = "realmoji-card";

      const img = document.createElement("img");
      const src = mediaUrl(rm.media?.path);
      if (src) img.src = src;
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
  }

  els.reactionCount.textContent = `(${state.reactions.length})`;
  if (!state.reactions.length) {
    els.reactionGrid.replaceChildren(
      emptyState(
        "No reaction Realmojis",
        "reaction-realmojis.json was missing, empty, or could not be read from your export.",
      ),
    );
    return;
  }

  const reactionFrag = document.createDocumentFragment();
  for (const rm of state.reactions) {
    const figure = document.createElement("figure");
    figure.className = "realmoji-card realmoji-card-compact";

    const img = document.createElement("img");
    if (rm.path) img.src = `${DATA_DIR}/${rm.path}`;
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

  if (!state.friends.length) {
    els.friendsList.replaceChildren(
      emptyState(
        "No friends found",
        "friends.json was missing, empty, or could not be read from your export.",
      ),
    );
    return;
  }

  if (!friends.length) {
    els.friendsList.replaceChildren(
      emptyState("No matching friends", "Try a different search."),
    );
    return;
  }

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

function syncChatEmptyCopy() {
  const title = els.chatEmpty.querySelector(".chat-empty-title");
  const detail = els.chatEmpty.querySelector(".muted");
  if (!title || !detail) return;

  if (!state.conversations.length) {
    title.textContent = "No chats found";
    detail.textContent =
      "No conversation logs were found in this export (or none could be read).";
  } else {
    title.textContent = "Pick a conversation";
    detail.textContent = "Your direct messages from the export show up here.";
  }
}

function renderChatThreads() {
  const totalMsgs = state.conversations.reduce((n, c) => n + c.messages.length, 0);
  els.chatStats.textContent = `${state.conversations.length} chats · ${totalMsgs} messages`;
  syncChatEmptyCopy();

  if (!state.conversations.length) {
    els.chatThreads.replaceChildren(
      emptyState(
        "No chats found",
        "Conversation folders were missing or empty in your export.",
      ),
    );
    return;
  }

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

  const avatarSrc = mediaUrl(user.profilePicture?.path);
  if (avatarSrc) {
    const img = document.createElement("img");
    img.className = "profile-avatar";
    img.alt = `${user.fullname || user.username || "Profile"} photo`;
    img.src = avatarSrc;
    els.profileHero.append(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "profile-avatar profile-avatar-fallback";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = (user.fullname || user.username || "?").slice(0, 1).toUpperCase();
    els.profileHero.append(placeholder);
  }

  const info = document.createElement("div");
  const name = document.createElement("h2");
  name.className = "profile-name";
  name.textContent = user.fullname || user.username || "Profile";
  const handle = document.createElement("p");
  handle.className = "profile-handle";
  handle.textContent = `@${user.username || "unknown"}`;
  info.append(name, handle);

  els.profileHero.append(info);

  els.profileFacts.replaceChildren();
  addFact(els.profileFacts, "Joined", user.createdAt ? formatTime(user.createdAt) : null);
  addFact(els.profileFacts, "Timezone", user.timezone);
  if (!els.profileFacts.children.length) {
    addFact(els.profileFacts, "Details", "Not available in this export");
  }
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
  els.detailPrev.addEventListener("click", () => navigateDetail(-1));
  els.detailNext.addEventListener("click", () => navigateDetail(1));
  document.addEventListener("keydown", (e) => {
    if (!els.detail.open && !els.detail.hasAttribute("open")) return;
    if (els.lightbox.open || els.lightbox.hasAttribute("open")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateDetail(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigateDetail(1);
    }
  });

  els.detailFront.addEventListener("click", () => openLightbox("front"));
  els.detailBack.addEventListener("click", () => openLightbox("back"));
  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightboxImg.addEventListener("click", (e) => {
    e.stopPropagation();
    closeLightbox();
  });
  els.lightbox.addEventListener("click", (e) => {
    if (e.target === els.lightbox) closeLightbox();
  });
  els.lightbox.addEventListener("close", () => {
    state.lightboxSide = null;
    els.lightboxImg.removeAttribute("src");
    els.lightboxImg.alt = "";
    els.lightboxImg.style.transform = "";
    els.lightboxImg.classList.remove("is-sideways");
    queueMicrotask(() => clearDetailFocus());
  });
}

async function main() {
  try {
    const [user, memoriesRaw, posts, comments, realmojis, reactions, friends, conversations] =
      await Promise.all([
        loadJson("user.json"),
        loadJsonOptional("memories.json", []),
        loadJsonOptional("posts.json", []),
        loadJsonOptional("comments.json", []),
        loadJsonOptional("realmojis.json", []),
        loadJsonOptional("reaction-realmojis.json", []),
        loadJsonOptional("friends.json", []),
        loadConversations(),
      ]);

    state.user = user && typeof user === "object" && !Array.isArray(user) ? user : {};
    state.memories = prepareMemories(asArray(memoriesRaw), asArray(posts));
    state.comments = asArray(comments);
    state.commentsByPost = groupComments(state.comments);
    state.realmojis = asArray(realmojis);
    state.reactions = asArray(reactions);
    state.friends = asArray(friends);
    state.conversations = asArray(conversations);
    state.personLabels = buildPersonLabels(state.conversations);
    if (state.conversations.length && !isNarrowChat()) {
      state.activeChatId = state.conversations[0].id;
    }

    const displayName = state.user.fullname || state.user.username || "BeReal";
    els.title.textContent = `${displayName}'s memories`;
    const handle = state.user.username ? `@${state.user.username}` : "Profile";
    els.subtitle.textContent = `${handle} · ${state.memories.length} memories`;

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
