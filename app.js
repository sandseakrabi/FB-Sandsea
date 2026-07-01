/* ===========================================================
   SandSea Restaurant — app.js  v3 (4-language edition)
   TH 🇹🇭 | EN 🇬🇧 | 中文 🇨🇳 | RU 🇷🇺
=========================================================== */

const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyN6i9tdgQk6hBhoFQi3fmPIGSHQtaohNQ-oPmEI2D9Ht0sePY43vNmnkLASeJSjQny/exec",
  IMAGE_MAX_DIM: 1000,
  IMAGE_QUALITY: 0.82
};

/* ---------------- helpers ---------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------------- i18n ---------------- */
const LANGS = [
  { code:"th", label:"TH", flag:"🇹🇭" },
  { code:"en", label:"EN", flag:"🇬🇧" },
  { code:"zh", label:"中文", flag:"🇨🇳" },
  { code:"ru", label:"RU",  flag:"🇷🇺" }
];

const I18N = {
  th: {
    headerSub:    "Railay Beach · เมนูอาหาร",
    lunch:        "มื้อกลางวัน",   lunchSub:  "Lunch Menu",
    dinner:       "มื้อกลางคืน",  dinnerSub: "Dinner Menu",
    staffLogin:   "เข้าสู่ระบบพนักงาน",
    zoomHint:     "ลากนิ้วเพื่อซูม / แตะนอกรูปเพื่อปิด",
    all:          "ทั้งหมด",
    emptyMenu:    "ยังไม่มีเมนูในหมวดนี้",
    tapZoom:      "🔍 แตะเพื่อดูใหญ่"
  },
  en: {
    headerSub:    "Railay Beach · Menu",
    lunch:        "Lunch",          lunchSub:  "Lunch Menu",
    dinner:       "Dinner",         dinnerSub: "Dinner Menu",
    staffLogin:   "Staff Login",
    zoomHint:     "Pinch to zoom · tap outside to close",
    all:          "All",
    emptyMenu:    "No dishes in this category yet",
    tapZoom:      "🔍 Tap to enlarge"
  },
  zh: {
    headerSub:    "莱利海滩 · 菜单",
    lunch:        "午餐",           lunchSub:  "午餐菜单",
    dinner:       "晚餐",           dinnerSub: "晚餐菜单",
    staffLogin:   "员工登录",
    zoomHint:     "双指缩放 · 点击外部关闭",
    all:          "全部",
    emptyMenu:    "此类别暂无菜品",
    tapZoom:      "🔍 点击放大"
  },
  ru: {
    headerSub:    "Пляж Рейли · Меню",
    lunch:        "Обед",           lunchSub:  "Обеденное меню",
    dinner:       "Ужин",           dinnerSub: "Вечернее меню",
    staffLogin:   "Вход для персонала",
    zoomHint:     "Щипок для масштаба · нажмите вне фото",
    all:          "Все",
    emptyMenu:    "В этой категории нет блюд",
    tapZoom:      "🔍 Нажмите для увеличения"
  }
};

const state = {
  items: [],
  categories: [],       // [{th,en,zh,ru}]
  period: "lunch",
  category: "all",
  adminToken: sessionStorage.getItem("ss_admin_token") || null,
  editingId: null,
  adminPeriodFilter: "all",
  lang: localStorage.getItem("ss_lang") || "th"
};

function t(key) {
  return (I18N[state.lang] && I18N[state.lang][key]) || I18N.th[key] || key;
}

// Get the right language field from an item/category object, fall back to TH
function localize(obj, prefix) {
  return (state.lang !== "th" && obj[prefix + "_" + state.lang])
    ? obj[prefix + "_" + state.lang]
    : obj[prefix + "_th"] || obj[prefix] || "";
}
function categoryLabel(c) {
  if (!c) return "";
  return (state.lang !== "th" && c[state.lang]) ? c[state.lang] : c.th;
}
function findCategory(th) { return state.categories.find(c => c.th === th); }

/* ---------- language switcher ---------- */
function buildLangSwitcher() {
  const btn = $("#btn-lang-toggle");
  // Build a dropdown on click
  btn.innerHTML = LANGS.find(l=>l.code===state.lang).flag + " " + LANGS.find(l=>l.code===state.lang).label + " ▾";

  btn.onclick = (e) => {
    e.stopPropagation();
    let menu = $("#lang-menu");
    if (menu) { menu.remove(); return; }
    menu = document.createElement("div");
    menu.id = "lang-menu";
    menu.style.cssText = `
      position:absolute; top:100%; right:0; margin-top:6px;
      background:rgba(21,48,79,.97); border-radius:12px; overflow:hidden;
      box-shadow:0 8px 24px rgba(0,0,0,.3); z-index:100; min-width:120px;
    `;
    LANGS.forEach(l => {
      const item = document.createElement("button");
      item.textContent = l.flag + "  " + l.label;
      item.style.cssText = `
        display:block; width:100%; padding:11px 18px; text-align:left;
        color:${l.code===state.lang?"#F2966B":"#FBF1DC"};
        font-weight:${l.code===state.lang?"700":"400"};
        font-family:inherit; font-size:.88rem; background:none; border:none; cursor:pointer;
      `;
      item.onclick = () => {
        state.lang = l.code;
        localStorage.setItem("ss_lang", l.code);
        menu.remove();
        buildLangSwitcher();
        applyStaticTranslations();
        if (!$("#screen-menu").classList.contains("hidden")) {
          $("#menu-crumb").textContent = t(state.period);
          renderCategoryChips();
          renderMenuGrid();
        }
      };
      menu.appendChild(item);
    });
    btn.parentElement.style.position = "relative";
    btn.parentElement.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener("click", close); };
    setTimeout(() => document.addEventListener("click", close), 0);
  };
}

function applyStaticTranslations() {
  $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  buildLangSwitcher();
  document.documentElement.lang = state.lang;
}

/* ---------------- UI helpers ---------------- */
function showLoading(text) {
  $("#loading-text").textContent = text || "กำลังโหลด...";
  $("#loading-overlay").classList.remove("hidden");
}
function hideLoading() { $("#loading-overlay").classList.add("hidden"); }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

function show(id) {
  ["screen-home","screen-menu","screen-login"].forEach(s =>
    $("#"+s).classList.toggle("hidden", s !== id)
  );
  $("#screen-admin").classList.add("hidden");
  window.scrollTo({ top: 0 });
}
function showAdmin() {
  ["screen-home","screen-menu","screen-login"].forEach(s => $("#"+s).classList.add("hidden"));
  $("#screen-admin").classList.remove("hidden");
}

/* ---------------- API ---------------- */
async function apiGet(params) {
  const url = new URL(CONFIG.API_URL);
  Object.entries(params || {}).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function apiPost(body) {
  const res = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function loadMenuData() {
  showLoading("กำลังโหลดเมนู...");
  try {
    const data = await apiGet({ action:"getMenu" });
    state.items = data.items || [];
    state.categories = data.categories || [];
  } catch(e) {
    toast("โหลดข้อมูลไม่สำเร็จ — ตรวจสอบ API_URL หรือการเชื่อมต่อ");
    console.error(e);
  } finally {
    hideLoading();
  }
}

/* ============================================================
   CUSTOMER VIEW
============================================================ */
function openMenuFor(period) {
  state.period = period;
  state.category = "all";
  $("#menu-crumb").textContent = t(period);
  renderCategoryChips();
  renderMenuGrid();
  show("screen-menu");
}

function catsForPeriod(period) {
  const used = new Set();
  state.items
    .filter(i => i.period === period || i.period === "both")
    .forEach(i => { if (i.category_th) used.add(i.category_th); });
  return state.categories.filter(c => used.has(c.th));
}

function renderCategoryChips() {
  const cats = catsForPeriod(state.period);
  const row = $("#category-chips");
  row.innerHTML = "";
  const mkChip = (label, active, onClick) => {
    const c = document.createElement("button");
    c.className = "chip" + (active ? " active" : "");
    c.textContent = label;
    c.onclick = onClick;
    row.appendChild(c);
  };
  mkChip(t("all"), state.category === "all", () => {
    state.category = "all"; renderCategoryChips(); renderMenuGrid();
  });
  cats.forEach(c => {
    mkChip(categoryLabel(c), state.category === c.th, () => {
      state.category = c.th; renderCategoryChips(); renderMenuGrid();
    });
  });
}

function renderMenuGrid() {
  const grid = $("#menu-grid");
  let list = state.items.filter(i => i.period === state.period || i.period === "both");
  if (state.category !== "all") list = list.filter(i => i.category_th === state.category);
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">🍽️</div>${t("emptyMenu")}</div>`;
    return;
  }
  grid.innerHTML = "";
  list.forEach(item => {
    const name = localize(item, "name");
    const desc = localize(item, "description");
    const card = document.createElement("div");
    card.className = "menu-card";
    card.innerHTML = `
      <div class="img-wrap">
        ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${escapeHtml(name)}" loading="lazy">` : ""}
        ${item.imageUrl ? `<span class="zoom-hint">${t("tapZoom")}</span>` : ""}
      </div>
      <div class="body">
        <div class="row1">
          <span class="name">${escapeHtml(name)}</span>
          <span class="price">฿${Number(item.price).toLocaleString()}</span>
        </div>
        ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ""}
      </div>`;
    if (item.imageUrl) {
      card.querySelector(".img-wrap").addEventListener("click", () => openLightbox(item.imageUrl, name));
    }
    grid.appendChild(card);
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])
  );
}

/* ---------------- Lightbox (pinch zoom) ---------------- */
let zoomScale = 1, zoomDist0 = 0;
function openLightbox(src, alt) {
  const img = $("#lightbox-img");
  img.src = src; img.alt = alt || "";
  img.style.transform = "scale(1)"; zoomScale = 1;
  $("#lightbox").classList.add("open");
}
function closeLightbox() { $("#lightbox").classList.remove("open"); }

$("#lightbox-close").onclick = closeLightbox;
$("#lightbox").addEventListener("click", e => { if (e.target.id === "lightbox") closeLightbox(); });
$("#lightbox-img").addEventListener("touchstart", e => {
  if (e.touches.length === 2)
    zoomDist0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
}, { passive:true });
$("#lightbox-img").addEventListener("touchmove", e => {
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    zoomScale = Math.min(4, Math.max(1, zoomScale * d / zoomDist0));
    zoomDist0 = d;
    $("#lightbox-img").style.transform = `scale(${zoomScale})`;
  }
}, { passive:true });
$("#lightbox-img").addEventListener("dblclick", () => {
  zoomScale = zoomScale > 1 ? 1 : 2;
  $("#lightbox-img").style.transform = `scale(${zoomScale})`;
});

/* ---------------- Nav ---------------- */
$$(".choice-card").forEach(c => c.addEventListener("click", () => openMenuFor(c.dataset.period)));
$("#btn-back-home").onclick = () => show("screen-home");
$("#btn-staff-login").onclick = () => show("screen-login");
$("#btn-cancel-login").onclick = () => show("screen-home");

/* ============================================================
   ADMIN: LOGIN
============================================================ */
$("#btn-do-login").onclick = async () => {
  const pw = $("#admin-password").value.trim();
  if (!pw) return toast("กรุณากรอกรหัสผ่าน");
  showLoading("กำลังตรวจสอบ...");
  try {
    const res = await apiPost({ action:"login", password:pw });
    hideLoading();
    if (res.ok) {
      state.adminToken = res.token;
      sessionStorage.setItem("ss_admin_token", res.token);
      $("#admin-password").value = "";
      enterAdmin();
    } else { toast("รหัสผ่านไม่ถูกต้อง"); }
  } catch(e) { hideLoading(); toast("เชื่อมต่อไม่สำเร็จ"); }
};

function enterAdmin() {
  showAdmin();
  switchAdminTab("list");
  populateCategorySelect();
  renderAdminList();
  renderCategoryTagList();
}

$("#btn-logout").onclick = () => {
  state.adminToken = null;
  sessionStorage.removeItem("ss_admin_token");
  show("screen-home");
};

/* ============================================================
   ADMIN: TABS
============================================================ */
$$(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchAdminTab(btn.dataset.tab)));
function switchAdminTab(tab) {
  $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  ["list","form","categories"].forEach(t => $("#tab-"+t).classList.toggle("hidden", t !== tab));
  if (tab === "list") renderAdminList();
  if (tab === "categories") renderCategoryTagList();
}

/* ============================================================
   ADMIN: LIST
============================================================ */
$$("#admin-period-filter .chip").forEach(c => {
  c.addEventListener("click", () => {
    state.adminPeriodFilter = c.dataset.period;
    $$("#admin-period-filter .chip").forEach(x => x.classList.toggle("active", x === c));
    renderAdminList();
  });
});

function renderAdminList() {
  const wrap = $("#admin-list");
  let list = state.items;
  if (state.adminPeriodFilter !== "all")
    list = list.filter(i => i.period === state.adminPeriodFilter || i.period === "both");
  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📋</div>ยังไม่มีเมนู — เพิ่มได้ที่แท็บ "เพิ่ม/แก้ไขเมนู"</div>`;
    return;
  }
  wrap.innerHTML = "";
  list.forEach(item => {
    const row = document.createElement("div");
    row.className = "admin-list-row";
    const cat = findCategory(item.category_th);
    const enName = item.name_en ? ` <span style="font-weight:400;color:var(--ink-soft);">/ ${escapeHtml(item.name_en)}</span>` : "";
    row.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}">` : `<div style="width:52px;height:52px;border-radius:10px;background:var(--sand);"></div>`}
      <div class="info">
        <div class="nm">${escapeHtml(item.name_th)}${enName}</div>
        <div class="meta">${escapeHtml(cat ? cat.th : "-")} · ฿${Number(item.price).toLocaleString()} · ${periodLabel(item.period)}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-edit="${item.id}">✏️</button>
        <button class="icon-btn" data-del="${item.id}">🗑️</button>
      </div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editItem(b.dataset.edit));
  wrap.querySelectorAll("[data-del]").forEach(b => b.onclick = () => deleteItem(b.dataset.del));
}
function periodLabel(p) { return p === "lunch" ? "กลางวัน" : p === "dinner" ? "กลางคืน" : "ทั้งสองช่วง"; }

/* ============================================================
   ADMIN: FORM
============================================================ */
let pendingImg = null;

$("#image-drop").onclick = () => $("#image-input").click();
$("#image-input").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  showLoading("กำลังบีบอัดรูปภาพ...");
  try {
    pendingImg = await compressImage(file, CONFIG.IMAGE_MAX_DIM, CONFIG.IMAGE_QUALITY);
    $("#image-preview-img").src = pendingImg;
    $("#image-preview-img").style.display = "block";
  } catch(err) { toast("ไม่สามารถประมวลผลรูปภาพได้"); }
  finally { hideLoading(); }
});

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width:w, height:h } = img;
        const ratio = 4/3;
        let sx=0, sy=0, sw=w, sh=h;
        if (w/h > ratio) { sw = h*ratio; sx = (w-sw)/2; }
        else             { sh = w/ratio; sy = (h-sh)/2; }
        const outW = maxDim, outH = Math.round(maxDim*3/4);
        const c = document.createElement("canvas");
        c.width = outW; c.height = outH;
        c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function populateCategorySelect() {
  const sel = $("#item-category");
  sel.innerHTML = `<option value="">— เลือกหมวดหมู่ —</option>`;
  state.categories.forEach(c => {
    const o = document.createElement("option");
    o.value = c.th;
    o.textContent = c.en ? `${c.th} / ${c.en}` : c.th;
    sel.appendChild(o);
  });
}

// Helper: get value safely
const fv = id => ($(id) ? $(id).value.trim() : "");

function editItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  state.editingId = id;
  $("#form-title").textContent = "แก้ไขเมนู";
  $("#item-id").value     = item.id;
  $("#item-name").value   = item.name_th || "";
  $("#item-name-en").value= item.name_en || "";
  $("#item-name-zh").value= item.name_zh || "";
  $("#item-name-ru").value= item.name_ru || "";
  $("#item-price").value  = item.price;
  $("#item-desc").value   = item.description_th || "";
  $("#item-desc-en").value= item.description_en || "";
  $("#item-desc-zh").value= item.description_zh || "";
  $("#item-desc-ru").value= item.description_ru || "";
  populateCategorySelect();
  $("#item-category").value = item.category_th || "";
  $("#item-period").value   = item.period || "lunch";
  pendingImg = null;
  if (item.imageUrl) { $("#image-preview-img").src = item.imageUrl; $("#image-preview-img").style.display = "block"; }
  else { $("#image-preview-img").style.display = "none"; }
  switchAdminTab("form");
}

$("#btn-reset-form").onclick = resetForm;
function resetForm() {
  state.editingId = null;
  $("#form-title").textContent = "เพิ่มเมนูใหม่";
  ["item-id","item-name","item-name-en","item-name-zh","item-name-ru",
   "item-price","item-desc","item-desc-en","item-desc-zh","item-desc-ru"].forEach(id => {
    const el = $(("#"+id)); if (el) el.value = "";
  });
  $("#item-category").value = "";
  $("#item-period").value = "lunch";
  $("#image-preview-img").style.display = "none";
  $("#image-input").value = "";
  pendingImg = null;
}

$("#btn-save-item").onclick = async () => {
  const name = fv("#item-name");
  const price = fv("#item-price");
  const category = $("#item-category").value;
  if (!name || !price || !category) return toast("กรุณากรอกชื่อ (ไทย) ราคา และหมวดหมู่ให้ครบ");

  const cat = findCategory(category);
  const payload = {
    action: state.editingId ? "updateItem" : "addItem",
    token: state.adminToken,
    id: state.editingId || undefined,
    name_th: name,          name_en: fv("#item-name-en"),
    name_zh: fv("#item-name-zh"), name_ru: fv("#item-name-ru"),
    price, period: $("#item-period").value,
    description_th: fv("#item-desc"),    description_en: fv("#item-desc-en"),
    description_zh: fv("#item-desc-zh"), description_ru: fv("#item-desc-ru"),
    category_th: category,
    category_en: cat ? cat.en : "", category_zh: cat ? cat.zh : "", category_ru: cat ? cat.ru : "",
    imageBase64: pendingImg || undefined
  };

  showLoading("กำลังบันทึก...");
  try {
    const res = await apiPost(payload);
    hideLoading();
    if (res.ok) {
      toast("บันทึกเมนูเรียบร้อย ✔");
      await loadMenuData();
      resetForm(); populateCategorySelect(); switchAdminTab("list");
    } else { toast(res.message || "บันทึกไม่สำเร็จ"); }
  } catch(e) { hideLoading(); toast("เชื่อมต่อไม่สำเร็จ"); }
};

async function deleteItem(id) {
  if (!confirm("ยืนยันการลบเมนูนี้?")) return;
  showLoading("กำลังลบ...");
  try {
    const res = await apiPost({ action:"deleteItem", token:state.adminToken, id });
    hideLoading();
    if (res.ok) { toast("ลบเมนูแล้ว"); await loadMenuData(); renderAdminList(); }
    else { toast(res.message || "ลบไม่สำเร็จ"); }
  } catch(e) { hideLoading(); toast("เชื่อมต่อไม่สำเร็จ"); }
}

/* ============================================================
   ADMIN: CATEGORIES
============================================================ */
function renderCategoryTagList() {
  const wrap = $("#category-tag-list");
  wrap.innerHTML = "";
  state.categories.forEach(c => {
    const parts = [c.th, c.en, c.zh, c.ru].filter(Boolean).join(" / ");
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `${escapeHtml(parts)} <button data-cat="${escapeHtml(c.th)}">✕</button>`;
    wrap.appendChild(tag);
  });
  wrap.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => removeCategory(b.dataset.cat));
}

$("#btn-add-category").onclick = async () => {
  const th = fv("#new-cat-th");
  if (!th) return;
  if (state.categories.some(c => c.th === th)) return toast("มีหมวดหมู่นี้อยู่แล้ว");
  showLoading("กำลังเพิ่มหมวดหมู่...");
  try {
    const res = await apiPost({
      action:"addCategory", token:state.adminToken,
      category_th: th, category_en: fv("#new-cat-en"),
      category_zh: fv("#new-cat-zh"), category_ru: fv("#new-cat-ru")
    });
    hideLoading();
    if (res.ok) {
      state.categories = res.categories;
      ["#new-cat-th","#new-cat-en","#new-cat-zh","#new-cat-ru"].forEach(s => { if($(s)) $(s).value=""; });
      renderCategoryTagList(); populateCategorySelect(); toast("เพิ่มหมวดหมู่แล้ว");
    } else { toast(res.message || "เพิ่มไม่สำเร็จ"); }
  } catch(e) { hideLoading(); toast("เชื่อมต่อไม่สำเร็จ"); }
};

async function removeCategory(th) {
  if (!confirm(`ลบหมวดหมู่ "${th}"?`)) return;
  showLoading("กำลังลบหมวดหมู่...");
  try {
    const res = await apiPost({ action:"removeCategory", token:state.adminToken, category_th:th });
    hideLoading();
    if (res.ok) { state.categories = res.categories; renderCategoryTagList(); populateCategorySelect(); }
    else { toast(res.message || "ลบไม่สำเร็จ"); }
  } catch(e) { hideLoading(); toast("เชื่อมต่อไม่สำเร็จ"); }
}

/* ============================================================
   PWA + INIT
============================================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}

(async function init() {
  applyStaticTranslations();
  if (CONFIG.API_URL.includes("PASTE_YOUR_APPS_SCRIPT")) {
    toast("⚠️ ยังไม่ได้ตั้งค่า API_URL ใน app.js");
  }
  await loadMenuData();
  if (state.adminToken) { enterAdmin(); } else { show("screen-home"); }
})();
