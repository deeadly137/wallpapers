"use strict";

const REPO = "deeadly137/wallpapers";

const state = { view: "grid", sort: "alpha", category: null, tag: null, query: "" };
let DATA = [];
let FILTERED = [];
let current = -1;

const $ = (id) => document.getElementById(id);

const fmtBytes = (b) =>
  b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");

const catPath = (img) => img.category.join("/");

function saveState() {
  localStorage.setItem("wallpapers-view", state.view);
  localStorage.setItem("wallpapers-sort", state.sort);
}

function loadState() {
  state.view = localStorage.getItem("wallpapers-view") || "grid";
  state.sort = localStorage.getItem("wallpapers-sort") || "alpha";
}

/* sidebar: category tree built from the data */

function buildCategoryTree() {
  const root = { children: new Map(), count: 0 };
  for (const img of DATA) {
    root.count++;
    let node = root;
    for (const part of img.category) {
      if (!node.children.has(part)) node.children.set(part, { children: new Map(), count: 0 });
      node = node.children.get(part);
      node.count++;
    }
  }
  return root;
}

function catButton(label, count, value) {
  const btn = document.createElement("button");
  btn.className = "cat-btn";
  btn.dataset.cat = value;
  const name = document.createElement("span");
  name.textContent = label;
  const badge = document.createElement("span");
  badge.className = "count";
  badge.textContent = count;
  btn.append(name, badge);
  btn.addEventListener("click", () => {
    state.category = value;
    closeSidebar();
    apply();
  });
  return btn;
}

const OPEN_KEY = "wallpapers-open-cats";
let openCats;
try {
  openCats = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[""]'));
} catch {
  openCats = new Set([""]);
}

const CHEVRON = '<svg viewBox="0 0 24 24"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>';

function toggleCat(li, path) {
  if (openCats.has(path)) openCats.delete(path);
  else openCats.add(path);
  localStorage.setItem(OPEN_KEY, JSON.stringify([...openCats]));
  li.classList.toggle("open");
}

function catNode(label, node, path) {
  const li = document.createElement("li");
  li.className = "cat-node" + (openCats.has(path) ? " open" : "");
  const row = document.createElement("div");
  row.className = "cat-row";
  if (node.children.size) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cat-toggle";
    toggle.setAttribute("aria-label", "toggle " + label);
    toggle.innerHTML = CHEVRON;
    toggle.addEventListener("click", () => toggleCat(li, path));
    row.appendChild(toggle);
  } else {
    const ghost = document.createElement("span");
    ghost.className = "cat-toggle ghost";
    row.appendChild(ghost);
  }
  row.appendChild(catButton(label, node.count, path));
  li.appendChild(row);
  if (node.children.size) {
    const wrap = document.createElement("div");
    wrap.className = "cat-children";
    const ul = document.createElement("ul");
    for (const [child, childNode] of node.children)
      ul.appendChild(catNode(child.toLowerCase(), childNode, path ? path + "/" + child : child));
    wrap.appendChild(ul);
    li.appendChild(wrap);
  }
  return li;
}

function renderSidebar() {
  const nav = $("cat-nav");
  nav.innerHTML = "";
  const root = buildCategoryTree();
  const ul = document.createElement("ul");
  ul.appendChild(catNode("all wallpapers", root, ""));
  nav.appendChild(ul);

  const counts = new Map();
  for (const img of DATA) for (const t of img.tags) counts.set(t, (counts.get(t) || 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24);
  const tags = $("tags");
  tags.innerHTML = "";
  for (const [tag] of top) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.dataset.tag = tag;
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      state.tag = state.tag === tag ? null : tag;
      apply();
    });
    tags.appendChild(chip);
  }
}

/* filtering, sorting and rendering */

function apply() {
  exitUpload();
  const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  FILTERED = DATA.filter((img) => {
    if (state.category) {
      const p = catPath(img);
      if (p !== state.category && !p.startsWith(state.category + "/")) return false;
    }
    if (state.tag && !img.tags.includes(state.tag)) return false;
    const haystack = img.name + " " + img.tags.join(" ");
    return tokens.every((t) => haystack.includes(t));
  });

  if (state.sort === "alpha") FILTERED.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === "color")
    FILTERED.sort((a, b) => a.hue - b.hue || a.light - b.light);
  else if (state.sort === "res") FILTERED.sort((a, b) => b.w * b.h - a.w * a.h);
  else if (state.sort === "size") FILTERED.sort((a, b) => b.bytes - a.bytes);

  render();
  updateActive();
  const bits = [`${FILTERED.length} of ${DATA.length} wallpapers`];
  if (state.category) bits.push(state.category.replace(/\//g, " / "));
  if (state.tag) bits.push("tag: " + state.tag);
  if (state.query.trim()) bits.push(`"${state.query.trim()}"`);
  $("results-info").textContent = bits.join("  ·  ");
}

function mediaElement(img, hoverPlay) {
  const src = encodePath(img.path);
  if (img.animated) {
    const video = document.createElement("video");
    video.src = src + "#t=0.1";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.style.aspectRatio = `${img.w} / ${img.h}`;
    if (hoverPlay) {
      video.addEventListener("pointerenter", () => video.play().catch(() => {}));
      video.addEventListener("pointerleave", () => video.pause());
    }
    return video;
  }
  const image = document.createElement("img");
  image.loading = "lazy";
  image.src = src;
  image.alt = img.name;
  image.style.aspectRatio = `${img.w} / ${img.h}`;
  return image;
}

function render() {
  const grid = $("grid");
  const list = $("list");
  grid.innerHTML = "";
  list.innerHTML = "";
  for (const img of FILTERED) {
    const src = encodePath(img.path);
    if (state.view === "grid") {
      const fig = document.createElement("figure");
      fig.className = "card";
      const media = mediaElement(img, true);
      const caption = document.createElement("figcaption");
      caption.textContent = (img.animated ? "▶ " : "") + img.name;
      fig.append(media, caption);
      fig.addEventListener("click", () => openLightbox(img));
      grid.appendChild(fig);
    } else {
      const row = document.createElement("div");
      row.className = "row";
      const media = mediaElement(img, false);
      const name = document.createElement("span");
      name.className = "row-name";
      name.textContent = (img.animated ? "▶ " : "") + img.name;
      const meta = document.createElement("span");
      meta.className = "row-meta";
      meta.textContent = `${img.w}×${img.h} · ${fmtBytes(img.bytes)}`;
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = img.color;
      dot.title = img.color;
      row.append(media, name, meta, dot);
      row.addEventListener("click", () => openLightbox(img));
      list.appendChild(row);
    }
  }
  grid.hidden = state.view !== "grid";
  list.hidden = state.view !== "list";
  $("empty").hidden = FILTERED.length > 0;
}

function updateActive() {
  for (const btn of document.querySelectorAll(".cat-btn"))
    btn.classList.toggle("active", btn.dataset.cat === state.category);
  for (const chip of document.querySelectorAll(".chip"))
    chip.classList.toggle("active", chip.dataset.tag === state.tag);
}

/* lightbox */

function openLightbox(img) {
  current = FILTERED.indexOf(img);
  showLightbox(img);
}

function showLightbox(img) {
  if (!img) img = FILTERED[current];
  if (!img) return;
  const src = encodePath(img.path);
  $("lb-img").hidden = !!img.animated;
  $("lb-link").hidden = !!img.animated;
  $("lb-video").hidden = !img.animated;
  if (img.animated) {
    $("lb-video").src = src;
    $("lb-video").play().catch(() => {});
  } else {
    $("lb-img").src = src;
    $("lb-img").alt = img.name;
  }
  $("lb-link").href = src;
  $("lb-name").textContent = img.name;
  $("lb-meta").textContent =
    `${img.category.join(" / ")} · ${img.w}×${img.h} · ${fmtBytes(img.bytes)} · ${img.color}` +
    (img.animated ? " · animated" : "");
  $("lb-download").href = src;
  $("lb-download").download = img.path.split("/").pop();
  $("lightbox").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  $("lb-video").pause();
  $("lightbox").hidden = true;
  document.body.style.overflow = "";
}

function stepLightbox(dir) {
  if (!FILTERED.length) return;
  current = (current + dir + FILTERED.length) % FILTERED.length;
  showLightbox(FILTERED[current]);
}

/* random picker: walks a shuffled deck, so nothing repeats
   until every wallpaper in the pool has been shown */
let randomDeck = [];
let lastRandom = null;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function randomWallpaper() {
  exitUpload();
  const pool = FILTERED.length ? FILTERED : DATA;
  if (!pool.length) return;

  // drop cards that no longer match the current filter
  const paths = new Set(pool.map((img) => img.path));
  randomDeck = randomDeck.filter((path) => paths.has(path));

  // reshuffle when the deck runs out
  if (!randomDeck.length)
    randomDeck = shuffle(pool.map((img) => img.path));

  let path = randomDeck.pop();
  // never show the same wallpaper twice in a row
  if (path === lastRandom && randomDeck.length) {
    const k = Math.floor(Math.random() * randomDeck.length);
    [path, randomDeck[k]] = [randomDeck[k], path];
  }
  lastRandom = path;

  const img = pool.find((i) => i.path === path);
  if (!img) return;
  current = FILTERED.indexOf(img);
  showLightbox(img);
}

/* routing, sidebar drawer and events */

function route() {
  const upload = location.hash === "#upload";
  $("gallery").hidden = upload;
  $("upload").hidden = !upload;
  closeSidebar();
}

function exitUpload() {
  if (location.hash === "#upload")
    history.replaceState(null, "", location.pathname + location.search);
  route();
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

function toggleSidebar() {
  if (window.matchMedia("(max-width: 900px)").matches)
    document.body.classList.toggle("sidebar-open");
  else
    document.body.classList.toggle("sidebar-closed");
}

/* tag suggestions under the searchbox */

let suggestItems = [];
let suggestIndex = -1;

function tagCandidates() {
  const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const last = tokens.length ? tokens[tokens.length - 1] : "";
  const counts = new Map();
  for (const img of DATA) for (const t of img.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()]
    .filter(([t]) => t.includes(last) && t !== state.tag)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
}

function hideSuggestions() {
  $("suggestions").hidden = true;
  suggestIndex = -1;
}

function renderSuggestions() {
  const box = $("suggestions");
  suggestItems = tagCandidates();
  suggestIndex = -1;
  box.innerHTML = "";
  if (!suggestItems.length) {
    box.hidden = true;
    return;
  }
  for (const [tag, count] of suggestItems) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    const name = document.createElement("span");
    name.textContent = tag;
    const badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = count;
    btn.append(name, badge);
    btn.addEventListener("pointerdown", (e) => e.preventDefault());
    btn.addEventListener("click", () => selectSuggestion(tag));
    box.appendChild(btn);
  }
  box.hidden = false;
}

function moveSuggestion(dir) {
  const buttons = [...$("suggestions").children];
  if (!buttons.length) return;
  suggestIndex = (suggestIndex + dir + buttons.length) % buttons.length;
  buttons.forEach((b, i) => b.classList.toggle("active", i === suggestIndex));
}

function selectSuggestion(tag) {
  const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length) tokens[tokens.length - 1] = tag;
  else tokens.push(tag);
  $("search").value = tokens.join(" ");
  state.query = $("search").value;
  state.tag = tag;
  hideSuggestions();
  apply();
}

function bind() {
  $("menu-btn").addEventListener("click", toggleSidebar);
  $("scrim").addEventListener("click", closeSidebar);

  $("search").addEventListener("input", () => {
    state.query = $("search").value;
    renderSuggestions();
    apply();
  });
  $("search").addEventListener("focus", renderSuggestions);

  document.addEventListener("pointerdown", (e) => {
    if (!$("suggestions").hidden && !e.target.closest(".searchbox")) hideSuggestions();
  });

  $("sort").value = state.sort;
  $("sort").addEventListener("change", () => {
    state.sort = $("sort").value;
    saveState();
    apply();
  });

  const setView = (view) => {
    exitUpload();
    state.view = view;
    saveState();
    $("grid-btn").classList.toggle("active", view === "grid");
    $("list-btn").classList.toggle("active", view === "list");
    render();
  };
  $("grid-btn").addEventListener("click", () => setView("grid"));
  $("list-btn").addEventListener("click", () => setView("list"));
  $("grid-btn").classList.toggle("active", state.view === "grid");
  $("list-btn").classList.toggle("active", state.view === "list");

  $("random-btn").addEventListener("click", randomWallpaper);
  $("reset-btn").addEventListener("click", () => {
    state.category = null;
    state.tag = null;
    state.query = "";
    $("search").value = "";
    apply();
  });

  $("lb-close").addEventListener("click", closeLightbox);
  $("lb-prev").addEventListener("click", () => stepLightbox(-1));
  $("lb-next").addEventListener("click", () => stepLightbox(1));
  $("lightbox").addEventListener("click", (e) => {
    if (e.target === $("lightbox")) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (!$("lightbox").hidden) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") stepLightbox(-1);
      else if (e.key === "ArrowRight") stepLightbox(1);
    } else if (!$("suggestions").hidden) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSuggestion(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSuggestion(-1);
      } else if (e.key === "Enter" && suggestIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestItems[suggestIndex][0]);
      } else if (e.key === "Escape") {
        hideSuggestions();
      }
    } else if (e.key === "/" && document.activeElement !== $("search")) {
      e.preventDefault();
      $("search").focus();
    }
  });

  window.addEventListener("hashchange", route);
  initUpload();
}

/* upload page: everything happens locally, contributors add the file by hand */

let uploadFile = null;
let uploadColor = "#33314b";
let uploadSuggestion = "Desktop/Dark";
let uploadName = "";
let uploadLink = "";

/* github rejects issue attachments over 10 MB */
const ATTACH_LIMIT = 10 * 1024 * 1024;

function leafCategories() {
  const paths = new Set(DATA.map(catPath));
  return [...paths].filter((p) => ![...paths].some((other) => other.startsWith(p + "/"))).sort();
}

function colorCategory(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const sat = max === 0 ? 0 : (max - min) / max;
  const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    const rr = (max - r / 255) / d, gr = (max - g / 255) / d, br = (max - b / 255) / d;
    if (r / 255 === max) hue = br - gr;
    else if (g / 255 === max) hue = 2 + rr - br;
    else hue = 4 + gr - rr;
    hue = (hue * 60 + 360) % 360;
  }
  if (sat < 0.14) return light < 30 ? "Desktop/Dark" : "Desktop/Gray-White";
  if (hue < 18 || hue >= 345) return "Desktop/Red-Orange";
  if (hue < 50) return light < 50 ? "Desktop/Brown" : "Desktop/Red-Orange";
  if (hue < 165) return "Desktop/Green";
  if (hue < 265) return "Desktop/Blue";
  if (hue < 300) return "Desktop/Purple";
  return "Desktop/Pink";
}

function kebabCase(name) {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "wallpaper";
}

function initUpload() {
  const dz = $("dropzone");
  const input = $("file-input");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("drag");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => {
    if (input.files[0]) handleFile(input.files[0]);
  });
  $("copy-issue-btn").addEventListener("click", copyIssue);
  $("open-issue-btn").addEventListener("click", openIssue);
  $("host-link").addEventListener("input", () => {
    uploadLink = $("host-link").value.trim();
  });
}

function handleFile(file) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;
  uploadFile = file;
  const isVideo = file.type.startsWith("video/");
  const url = URL.createObjectURL(file);
  const preview = isVideo ? $("preview-video") : $("preview-img");
  $("preview-img").hidden = isVideo;
  $("preview-video").hidden = !isVideo;
  const measure = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    canvas.getContext("2d").drawImage(preview, 0, 0, 1, 1);
    const [r, g, b] = canvas.getContext("2d").getImageData(0, 0, 1, 1).data;
    uploadColor = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

    const w = isVideo ? preview.videoWidth : preview.naturalWidth;
    const h = isVideo ? preview.videoHeight : preview.naturalHeight;
    $("preview-res").textContent = `${w}×${h}`;
    $("preview-size").textContent = fmtBytes(file.size);
    $("preview-swatch").style.background = uploadColor;
    $("preview-hex").textContent = uploadColor;

    const ext = (file.name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    uploadName = kebabCase(file.name) + (ext || (isVideo ? ".mp4" : ".jpg"));
    $("suggested-name").textContent = uploadName;

    const portrait = h > w;
    uploadSuggestion = portrait ? "Mobile" : isVideo ? "Animated" : colorCategory(r, g, b);
    if (!leafCategories().includes(uploadSuggestion))
      uploadSuggestion = portrait ? "Mobile" : "Desktop/Dark";

    const select = $("category-select");
    select.innerHTML = "";
    for (const cat of leafCategories()) {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat.replace(/\//g, " / ");
      if (cat === uploadSuggestion) option.selected = true;
      select.appendChild(option);
    }
    select.onchange = () => (uploadSuggestion = select.value);

    $("upload-preview").hidden = false;

    // github caps issue attachments at 10 MB, so big files need a hosted link
    uploadLink = "";
    $("host-link").value = "";
    $("oversize").hidden = file.size <= ATTACH_LIMIT;
  };
  if (isVideo) {
    preview.muted = true;
    preview.onloadeddata = measure;
  } else {
    preview.onload = measure;
  }
  preview.src = url;
}

function issueText() {
  const oversized = uploadFile && uploadFile.size > ATTACH_LIMIT;
  const lines = [
    "**wallpaper upload**",
    "",
    `- **suggested file name:** \`${uploadName}\` (from \`${uploadFile ? uploadFile.name : ""}\`)`,
    `- **category:** ${uploadSuggestion}`,
    `- **resolution:** ${$("preview-res").textContent}`,
    `- **file size:** ${$("preview-size").textContent}`,
    `- **average color:** ${uploadColor}`,
  ];
  if (uploadFile && uploadFile.type.startsWith("video/"))
    lines.push("- **animated:** yes (video wallpaper, mp4/webm)");
  if (uploadLink) lines.push(`- **download link:** ${uploadLink}`);
  lines.push("");
  if (oversized && !uploadLink)
    lines.push(
      "this file is over the 10 MB issue attachment limit — ask the uploader for a hosted link (catbox.moe etc.) or a pull request.",
    );
  else
    lines.push(
      "attach the file to this issue — contributors will add it to the repo without touching the resolution or file size.",
    );
  return lines.join("\n");
}

async function copyIssue() {
  const btn = $("copy-issue-btn");
  try {
    await navigator.clipboard.writeText(issueText());
    btn.textContent = "copied!";
  } catch {
    btn.textContent = "copy failed";
  }
  setTimeout(() => (btn.textContent = "copy issue text"), 1600);
}

function openIssue() {
  const name = uploadName || "wallpaper";
  const url = `https://github.com/${REPO}/issues/new?title=${
    encodeURIComponent(`upload: ${name}`)
  }&body=${encodeURIComponent(issueText())}`;
  window.open(url, "_blank", "noopener");
}

/* boot */

async function init() {
  loadState();
  const res = await fetch("docs/data.json");
  DATA = (await res.json()).images;
  renderSidebar();
  bind();
  apply();
  route();
}

init();
