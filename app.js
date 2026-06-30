/* ===========================================================
   SandSea Restaurant — app.js
   Frontend logic. Talks to a Google Apps Script Web App
   (code.gs) which reads/writes a Google Sheet + Drive folder.
   ALL devices read/write the same backend -> always in sync.
=========================================================== */

const CONFIG = {
  // 👉 After deploying code.gs as a Web App, paste the URL here.
  //    Example: https://script.google.com/macros/s/AKfycb.../exec
  API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
  IMAGE_MAX_DIM: 1000,
  IMAGE_QUALITY: 0.82
};

const state = {
  items: [],
  categories: [],   // [{th, en}]
  period: "lunch",      // customer-selected period
  category: "all",
  adminToken: sessionStorage.getItem("ss_admin_token") || null,
  editingId: null,
  adminPeriodFilter: "all",
  lang: localStorage.getItem("ss_lang") || "th"
};

/* ---------------- helpers ---------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const I18N = {
  th: {
    headerSub: "Railay Beach · เมนูอาหาร",
    lunch: "มื้อกลางวัน", lunchSub: "Lunch Menu",
    dinner: "มื้อกลางคืน", dinnerSub: "Dinner Menu",
    staffLogin: "เข้าสู่ระบบพนักงาน",
    zoomHint: "ลากนิ้วเพื่อซูม / แตะนอกรูปเพื่อปิด",
    all: "ทั้งหมด",
    emptyCategory: "ยังไม่มีเมนูในหมวดนี้",
    tapToZoom: "🔍 แตะเพื่อดูใหญ่"
  },
  en: {
    headerSub: "Railay Beach · Menu",
    lunch: "Lunch", lunchSub: "Lunch Menu",
    dinner: "Dinner", dinnerSub: "Dinner Menu",
    staffLogin: "Staff Login",
    zoomHint: "Pinch to zoom / tap outside to close",
    all: "All",
    emptyCategory: "No dishes in this category yet",
    tapToZoom: "🔍 Tap to enlarge"
  }
};
function t(key){ return (I18N[state.lang] && I18N[state.lang][key]) || I18N.th[key] || key; }

function applyStaticTranslations(){
  $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  $("#btn-lang-toggle").textContent = state.lang === "th" ? "EN" : "ไทย";
  document.documentElement.lang = state.lang === "th" ? "th" : "en";
}

$("#btn-lang-toggle").addEventListener("click", ()=>{
  state.lang = state.lang === "th" ? "en" : "th";
  localStorage.setItem("ss_lang", state.lang);
  applyStaticTranslations();
  // re-render whichever customer screen is visible
  if(!$("#screen-menu").classList.contains("hidden")){
    $("#menu-crumb").textContent = t(state.period);
    renderCategoryChips();
    renderMenuGrid();
  }
});

/* bilingual field readers — fall back to Thai if English wasn't entered */
function itemName(item){ return (state.lang === "en" && item.name_en) ? item.name_en : item.name_th; }
function itemDesc(item){ return (state.lang === "en" && item.description_en) ? item.description_en : item.description_th; }
function categoryLabel(catObj){
  if(!catObj) return "";
  return (state.lang === "en" && catObj.en) ? catObj.en : catObj.th;
}
function findCategory(th){ return state.categories.find(c=>c.th===th); }

function showLoading(text){
  $("#loading-text").textContent = text || "กำลังโหลด...";
  $("#loading-overlay").classList.remove("hidden");
}
function hideLoading(){ $("#loading-overlay").classList.add("hidden"); }

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2200);
}

function show(id){
  ["screen-home","screen-menu","screen-login"].forEach(s=>{
    $("#"+s).classList.toggle("hidden", s !== id);
  });
  $("#screen-admin").classList.add("hidden");
  window.scrollTo({top:0});
}
function showAdmin(){
  ["screen-home","screen-menu","screen-login"].forEach(s=>$("#"+s).classList.add("hidden"));
  $("#screen-admin").classList.remove("hidden");
}

/* ---------------- API layer ---------------- */
async function apiGet(params){
  const url = new URL(CONFIG.API_URL);
  Object.entries(params||{}).forEach(([k,v])=>url.searchParams.set(k,v));
  const res = await fetch(url.toString());
  if(!res.ok) throw new Error("Network error");
  return res.json();
}
async function apiPost(body){
  const res = await fetch(CONFIG.API_URL, {
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"}, // avoids CORS preflight on Apps Script
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error("Network error");
  return res.json();
}

async function loadMenuData(){
  showLoading("กำลังโหลดเมนู...");
  try{
    const data = await apiGet({action:"getMenu"});
    state.items = data.items || [];
    state.categories = data.categories || [];
  }catch(e){
    toast("โหลดข้อมูลไม่สำเร็จ ตรวจสอบการเชื่อมต่อ");
    console.error(e);
  }finally{
    hideLoading();
  }
}

/* ---------------- CUSTOMER VIEW ---------------- */
function openMenuFor(period){
  state.period = period;
  state.category = "all";
  $("#menu-crumb").textContent = t(period);
  renderCategoryChips();
  renderMenuGrid();
  show("screen-menu");
}

function categoriesForPeriod(period){
  const ths = new Set();
  state.items.filter(i => i.period === period || i.period === "both").forEach(i=>{
    if(i.category_th) ths.add(i.category_th);
  });
  // preserve admin-defined order
  return state.categories.filter(c => ths.has(c.th));
}

function renderCategoryChips(){
  const cats = categoriesForPeriod(state.period);
  const row = $("#category-chips");
  row.innerHTML = "";
  const allChip = document.createElement("button");
  allChip.className = "chip" + (state.category==="all" ? " active" : "");
  allChip.textContent = t("all");
  allChip.onclick = ()=>{ state.category="all"; renderCategoryChips(); renderMenuGrid(); };
  row.appendChild(allChip);
  cats.forEach(c=>{
    const chip = document.createElement("button");
    chip.className = "chip" + (state.category===c.th ? " active" : "");
    chip.textContent = categoryLabel(c);
    chip.onclick = ()=>{ state.category=c.th; renderCategoryChips(); renderMenuGrid(); };
    row.appendChild(chip);
  });
}

function renderMenuGrid(){
  const grid = $("#menu-grid");
  let list = state.items.filter(i => i.period === state.period || i.period === "both");
  if(state.category !== "all") list = list.filter(i=>i.category_th===state.category);

  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state"><div class="icon">🍽️</div>${t("emptyCategory")}</div>`;
    return;
  }
  grid.innerHTML = "";
  list.forEach(item=>{
    const card = document.createElement("div");
    card.className = "menu-card";
    const nm = itemName(item), desc = itemDesc(item);
    card.innerHTML = `
      <div class="img-wrap">
        ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${escapeHtml(nm)}" loading="lazy">` : ""}
        <span class="zoom-hint">${t("tapToZoom")}</span>
      </div>
      <div class="body">
        <div class="row1">
          <span class="name">${escapeHtml(nm)}</span>
          <span class="price">฿${Number(item.price).toLocaleString()}</span>
        </div>
        ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ""}
      </div>`;
    if(item.imageUrl){
      card.querySelector(".img-wrap").addEventListener("click", ()=>openLightbox(item.imageUrl, nm));
    }
    grid.appendChild(card);
  });
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

/* ---------------- LIGHTBOX (pinch zoom) ---------------- */
let zoomScale = 1, zoomStartDist = 0;
function openLightbox(src, alt){
  $("#lightbox-img").src = src;
  $("#lightbox-img").alt = alt || "";
  $("#lightbox-img").style.transform = "scale(1)";
  zoomScale = 1;
  $("#lightbox").classList.add("open");
}
function closeLightbox(){ $("#lightbox").classList.remove("open"); }

$("#lightbox-close").onclick = closeLightbox;
$("#lightbox").addEventListener("click", (e)=>{ if(e.target.id === "lightbox") closeLightbox(); });
$("#lightbox-img").addEventListener("touchstart", (e)=>{
  if(e.touches.length === 2){
    zoomStartDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
  }
}, {passive:true});
$("#lightbox-img").addEventListener("touchmove", (e)=>{
  if(e.touches.length === 2){
    const dist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    zoomScale = Math.min(4, Math.max(1, zoomScale * (dist/zoomStartDist)));
    zoomStartDist = dist;
    $("#lightbox-img").style.transform = `scale(${zoomScale})`;
  }
}, {passive:true});
$("#lightbox-img").addEventListener("dblclick", ()=>{
  zoomScale = zoomScale > 1 ? 1 : 2;
  $("#lightbox-img").style.transform = `scale(${zoomScale})`;
});

/* ---------------- NAV BINDINGS ---------------- */
$$(".choice-card").forEach(c=>c.addEventListener("click", ()=>openMenuFor(c.dataset.period)));
$("#btn-back-home").onclick = ()=>show("screen-home");
$("#btn-staff-login").onclick = ()=>show("screen-login");
$("#btn-cancel-login").onclick = ()=>show("screen-home");

/* ---------------- ADMIN: LOGIN ---------------- */
$("#btn-do-login").onclick = async ()=>{
  const pw = $("#admin-password").value.trim();
  if(!pw) return toast("กรุณากรอกรหัสผ่าน");
  showLoading("กำลังตรวจสอบ...");
  try{
    const res = await apiPost({action:"login", password:pw});
    hideLoading();
    if(res.ok){
      state.adminToken = res.token;
      sessionStorage.setItem("ss_admin_token", res.token);
      $("#admin-password").value = "";
      enterAdmin();
    }else{
      toast("รหัสผ่านไม่ถูกต้อง");
    }
  }catch(e){
    hideLoading();
    toast("เชื่อมต่อไม่สำเร็จ");
  }
};

function enterAdmin(){
  showAdmin();
  switchAdminTab("list");
  populateCategorySelect();
  renderAdminList();
  renderCategoryTagList();
}

$("#btn-logout").onclick = ()=>{
  state.adminToken = null;
  sessionStorage.removeItem("ss_admin_token");
  show("screen-home");
};

/* ---------------- ADMIN: TABS ---------------- */
$$(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>switchAdminTab(btn.dataset.tab));
});
function switchAdminTab(tab){
  $$(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  ["list","form","categories"].forEach(t=>{
    $("#tab-"+t).classList.toggle("hidden", t!==tab);
  });
  if(tab==="list") renderAdminList();
  if(tab==="categories") renderCategoryTagList();
}

/* ---------------- ADMIN: LIST ---------------- */
$$("#admin-period-filter .chip").forEach(c=>{
  c.addEventListener("click", ()=>{
    state.adminPeriodFilter = c.dataset.period;
    $$("#admin-period-filter .chip").forEach(x=>x.classList.toggle("active", x===c));
    renderAdminList();
  });
});

function renderAdminList(){
  const wrap = $("#admin-list");
  let list = state.items;
  if(state.adminPeriodFilter !== "all"){
    list = list.filter(i=>i.period===state.adminPeriodFilter || i.period==="both");
  }
  if(list.length===0){
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📋</div>ยังไม่มีเมนู เริ่มเพิ่มได้จากแท็บ "เพิ่ม/แก้ไขเมนู"</div>`;
    return;
  }
  wrap.innerHTML = "";
  list.forEach(item=>{
    const row = document.createElement("div");
    row.className = "admin-list-row";
    const cat = findCategory(item.category_th);
    row.innerHTML = `
      ${item.imageUrl ? `<img src="${item.imageUrl}">` : `<div style="width:52px;height:52px;border-radius:10px;background:var(--sand);"></div>`}
      <div class="info">
        <div class="nm">${escapeHtml(item.name_th)}${item.name_en ? ` <span style="font-weight:400;color:var(--ink-soft);">/ ${escapeHtml(item.name_en)}</span>` : ""}</div>
        <div class="meta">${escapeHtml(cat ? cat.th : "-")} · ฿${Number(item.price).toLocaleString()} · ${periodLabel(item.period)}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-edit="${item.id}">✏️</button>
        <button class="icon-btn" data-del="${item.id}">🗑️</button>
      </div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("[data-edit]").forEach(b=>b.onclick = ()=>editItem(b.dataset.edit));
  wrap.querySelectorAll("[data-del]").forEach(b=>b.onclick = ()=>deleteItem(b.dataset.del));
}
function periodLabel(p){ return p==="lunch"?"กลางวัน":p==="dinner"?"กลางคืน":"ทั้งสองช่วง"; }

/* ---------------- ADMIN: FORM (add/edit) ---------------- */
let pendingImageBase64 = null;

$("#image-drop").onclick = ()=> $("#image-input").click();
$("#image-input").addEventListener("change", async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  showLoading("กำลังบีบอัดรูปภาพ...");
  try{
    pendingImageBase64 = await compressImage(file, CONFIG.IMAGE_MAX_DIM, CONFIG.IMAGE_QUALITY);
    $("#image-preview-img").src = pendingImageBase64;
    $("#image-preview-img").style.display = "block";
  }catch(err){
    toast("ไม่สามารถประมวลผลรูปภาพได้");
  }finally{
    hideLoading();
  }
});

function compressImage(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let { width, height } = img;
        // crop to 4:3 then resize -> consistent dimensions across all menu photos
        const targetRatio = 4/3;
        let srcW = width, srcH = height, sx=0, sy=0;
        if(width/height > targetRatio){
          srcW = height * targetRatio; sx = (width-srcW)/2;
        }else{
          srcH = width / targetRatio; sy = (height-srcH)/2;
        }
        const outW = maxDim, outH = Math.round(maxDim*3/4);
        const canvas = document.createElement("canvas");
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, outW, outH);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function populateCategorySelect(){
  const sel = $("#item-category");
  sel.innerHTML = `<option value="">— เลือกหมวดหมู่ —</option>`;
  state.categories.forEach(c=>{
    const opt = document.createElement("option");
    opt.value = c.th; opt.textContent = c.en ? `${c.th} / ${c.en}` : c.th;
    sel.appendChild(opt);
  });
}

function editItem(id){
  const item = state.items.find(i=>i.id===id);
  if(!item) return;
  state.editingId = id;
  $("#form-title").textContent = "แก้ไขเมนู";
  $("#item-id").value = item.id;
  $("#item-name").value = item.name_th;
  $("#item-name-en").value = item.name_en || "";
  $("#item-price").value = item.price;
  $("#item-desc").value = item.description_th || "";
  $("#item-desc-en").value = item.description_en || "";
  populateCategorySelect();
  $("#item-category").value = item.category_th || "";
  $("#item-period").value = item.period || "lunch";
  pendingImageBase64 = null;
  if(item.imageUrl){
    $("#image-preview-img").src = item.imageUrl;
    $("#image-preview-img").style.display = "block";
  }else{
    $("#image-preview-img").style.display = "none";
  }
  switchAdminTab("form");
}

$("#btn-reset-form").onclick = resetForm;
function resetForm(){
  state.editingId = null;
  $("#form-title").textContent = "เพิ่มเมนูใหม่";
  $("#item-id").value = "";
  $("#item-name").value = "";
  $("#item-name-en").value = "";
  $("#item-price").value = "";
  $("#item-desc").value = "";
  $("#item-desc-en").value = "";
  $("#item-category").value = "";
  $("#item-period").value = "lunch";
  $("#image-preview-img").style.display = "none";
  $("#image-input").value = "";
  pendingImageBase64 = null;
}

$("#btn-save-item").onclick = async ()=>{
  const name = $("#item-name").value.trim();
  const nameEn = $("#item-name-en").value.trim();
  const price = $("#item-price").value.trim();
  const category = $("#item-category").value;
  const period = $("#item-period").value;
  const description = $("#item-desc").value.trim();
  const descriptionEn = $("#item-desc-en").value.trim();

  if(!name || !price || !category){
    return toast("กรุณากรอกชื่อ ราคา และหมวดหมู่ให้ครบ");
  }

  const payload = {
    action: state.editingId ? "updateItem" : "addItem",
    token: state.adminToken,
    id: state.editingId || undefined,
    name_th: name, name_en: nameEn,
    price, category_th: category, period,
    description_th: description, description_en: descriptionEn,
    imageBase64: pendingImageBase64 || undefined
  };

  showLoading("กำลังบันทึก...");
  try{
    const res = await apiPost(payload);
    hideLoading();
    if(res.ok){
      toast("บันทึกเมนูเรียบร้อย");
      await loadMenuData();
      resetForm();
      populateCategorySelect();
      switchAdminTab("list");
    }else{
      toast(res.message || "บันทึกไม่สำเร็จ");
    }
  }catch(e){
    hideLoading();
    toast("เชื่อมต่อไม่สำเร็จ");
  }
};

async function deleteItem(id){
  if(!confirm("ยืนยันการลบเมนูนี้?")) return;
  showLoading("กำลังลบ...");
  try{
    const res = await apiPost({action:"deleteItem", token: state.adminToken, id});
    hideLoading();
    if(res.ok){
      toast("ลบเมนูแล้ว");
      await loadMenuData();
      renderAdminList();
    }else{
      toast(res.message || "ลบไม่สำเร็จ");
    }
  }catch(e){
    hideLoading();
    toast("เชื่อมต่อไม่สำเร็จ");
  }
}

/* ---------------- ADMIN: CATEGORIES ---------------- */
function renderCategoryTagList(){
  const wrap = $("#category-tag-list");
  wrap.innerHTML = "";
  state.categories.forEach(c=>{
    const tag = document.createElement("div");
    tag.className = "tag";
    const label = c.en ? `${c.th} / ${c.en}` : c.th;
    tag.innerHTML = `${escapeHtml(label)} <button data-cat="${escapeHtml(c.th)}">✕</button>`;
    wrap.appendChild(tag);
  });
  wrap.querySelectorAll("[data-cat]").forEach(b=>{
    b.onclick = ()=>removeCategory(b.dataset.cat);
  });
}

$("#btn-add-category").onclick = async ()=>{
  const val = $("#new-category-input").value.trim();
  const valEn = $("#new-category-input-en").value.trim();
  if(!val) return;
  if(state.categories.some(c=>c.th===val)) return toast("มีหมวดหมู่นี้อยู่แล้ว");
  showLoading("กำลังเพิ่มหมวดหมู่...");
  try{
    const res = await apiPost({action:"addCategory", token: state.adminToken, category_th: val, category_en: valEn});
    hideLoading();
    if(res.ok){
      state.categories = res.categories;
      $("#new-category-input").value = "";
      $("#new-category-input-en").value = "";
      renderCategoryTagList();
      populateCategorySelect();
      toast("เพิ่มหมวดหมู่แล้ว");
    }else{
      toast(res.message || "เพิ่มไม่สำเร็จ");
    }
  }catch(e){
    hideLoading();
    toast("เชื่อมต่อไม่สำเร็จ");
  }
};

async function removeCategory(catTh){
  if(!confirm(`ลบหมวดหมู่ "${catTh}"? (เมนูที่ใช้หมวดนี้จะไม่ถูกลบ)`)) return;
  showLoading("กำลังลบหมวดหมู่...");
  try{
    const res = await apiPost({action:"removeCategory", token: state.adminToken, category_th: catTh});
    hideLoading();
    if(res.ok){
      state.categories = res.categories;
      renderCategoryTagList();
      populateCategorySelect();
    }else{
      toast(res.message || "ลบไม่สำเร็จ");
    }
  }catch(e){
    hideLoading();
    toast("เชื่อมต่อไม่สำเร็จ");
  }
}

/* ---------------- INIT ---------------- */
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

(async function init(){
  applyStaticTranslations();
  if(CONFIG.API_URL.includes("PASTE_YOUR_APPS_SCRIPT")){
    toast("⚠️ ยังไม่ได้ตั้งค่า API_URL ใน app.js");
  }
  await loadMenuData();
  if(state.adminToken){
    enterAdmin();
  }else{
    show("screen-home");
  }
})();
