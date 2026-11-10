/* ===========================================================
   SandSea Restaurant — pos.js  (ระบบรับออเดอร์ / เปิดโต๊ะ / เช็คบิล)
   โหลดต่อจาก app.js — ใช้ตัวแปรกลางของ app.js: $, $$, state, toast,
   show, showLoading, hideLoading, apiPost, escapeHtml
=========================================================== */

const POS = {
  staff: localStorage.getItem("ss_staff") || "",
  bills: [],          // โต๊ะที่เปิดอยู่ (จาก server)
  qrUrl: "",
  billId: null,       // บิลของโต๊ะที่กำลังสั่ง (เปิดโต๊ะใหม่ก็จะได้ billId ทันทีจาก server)
  isNewTable: false,  // true = เพิ่งเปิดโต๊ะ ยังไม่เคยสั่งอาหารสักรอบ
  tableNo: "",
  cart: [],           // [{itemId,name,price,qty,note}]
  period: "all",
  cat: "all",
  q: "",
  detailId: null,
  payMethod: "",
  discount: 0,
  customerType: "outside",   // outside | hotel
  roomNo: ""
};
const PAY_LABEL = { cash: "เงินสด 💵", credit: "เครดิต 💳", room: "ลงห้อง 🏨", qr: "QR 📱" };
const fmt = n => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function normTable(v) {
  let s = String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, " ");
  if (/^\d+$/.test(s)) s = String(parseInt(s, 10));
  return s;
}

/* เรียก API แบบมี token + จัดการ session หมดอายุ */
async function call(action, data) {
  try {
    const res = await apiPost(Object.assign({ action, token: state.adminToken }, data || {}));
    if (res && res.message === "กรุณาเข้าสู่ระบบใหม่") {
      toast("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      state.adminToken = null;
      sessionStorage.removeItem("ss_admin_token");
      show("screen-login");
      return null;
    }
    return res;
  } catch (e) {
    console.error("API error", e);
    POS.lastErr = "เชื่อมต่อ Apps Script ไม่สำเร็จ — ส่วนใหญ่เกิดจากยังไม่ได้รัน repairAndSetup / ยังไม่ได้ Deploy code.gs เวอร์ชันใหม่ หรือสคริปต์เกิดข้อผิดพลาด (ดูหน้า Executions ใน Apps Script)";
    toast("เชื่อมต่อไม่สำเร็จ");
    return null;
  }
}
function setPosError(msg) {
  const el = $("#pos-error");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}
function openModal(id) { $("#" + id).classList.remove("hidden"); }
function closeModal(id) { $("#" + id).classList.add("hidden"); }

/* ============================ STAFF HOME ============================ */
function enterStaffHome() { show("screen-staff"); }

$("#btn-go-pos").onclick = openPOS;
$("#btn-go-admin").onclick = () => enterAdmin();
$("#btn-admin-back").onclick = () => show("screen-staff");
$("#btn-pos-back").onclick = () => show("screen-staff");
$("#btn-staff-logout").onclick = () => {
  state.adminToken = null;
  sessionStorage.removeItem("ss_admin_token");
  show("screen-home");
};

/* อัปโหลดรูป QR ร้าน (ไม่ครอป เพื่อให้สแกนได้) */
$("#btn-go-qr").onclick = () => $("#qr-input").click();
$("#qr-input").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  showLoading("กำลังอัปโหลด QR...");
  try {
    const dataUrl = await fileToPng(file, 900);
    const res = await call("setQr", { imageBase64: dataUrl });
    hideLoading();
    if (res && res.ok) { POS.qrUrl = res.qrUrl; toast("บันทึกรูป QR แล้ว ✔"); }
    else if (res) toast(res.message || "บันทึกไม่สำเร็จ");
  } catch (err) { hideLoading(); toast("ประมวลผลรูปไม่ได้"); }
  e.target.value = "";
});
function fileToPng(file, maxDim) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = reject; img.src = ev.target.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}

/* ============================ POS: TABLES ============================ */
function posView(v) {
  ["tables", "order", "detail"].forEach(x => $("#pos-" + x).classList.toggle("hidden", x !== v));
  window.scrollTo({ top: 0 });
}
async function openPOS() {
  show("screen-pos");
  posView("tables");
  await refreshBills();
}
async function refreshBills(silent) {
  if (!silent) showLoading("กำลังโหลดโต๊ะ...");
  const res = await call("getOpenBills");
  hideLoading();
  if (res && res.ok) { POS.bills = res.bills || []; POS.qrUrl = res.qrUrl || ""; setPosError(""); }
  else if (res) {
    setPosError("⚠️ โหลดโต๊ะไม่สำเร็จ: " + (res.message || "ไม่ทราบสาเหตุ") +
      (res.message === "Unknown action" ? " — แปลว่า Apps Script ยังเป็นเวอร์ชันเก่า ให้ Deploy code.gs เวอร์ชันใหม่" : ""));
  } else if (POS.lastErr) setPosError("⚠️ " + POS.lastErr);
  renderTables();
  return !!(res && res.ok);
}
function renderTables() {
  $("#pos-staff").value = POS.staff;
  const wrap = $("#pos-open-tables");
  if (!POS.bills.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:24px 10px;">ยังไม่มีโต๊ะที่เปิดอยู่</div>`;
    return;
  }
  wrap.innerHTML = POS.bills.map(b => `
    <button class="table-btn" data-bill="${escapeHtml(b.billId)}">
      <span class="tno">${escapeHtml(b.tableNo)}</span>
      <span class="tsum">฿${fmt(b.subtotal)}</span>
      <span class="tmeta">${b.customerType === "hotel" ? "🏨 ห้อง " + escapeHtml(b.roomNo) : "ลูกค้านอก"} · ${escapeHtml(b.staff)}</span>
    </button>`).join("");
  wrap.querySelectorAll("[data-bill]").forEach(b => b.onclick = () => openDetail(b.dataset.bill));
}
$("#btn-refresh-tables").onclick = () => refreshBills();

$("#btn-open-table").onclick = async () => {
  const staff = $("#pos-staff").value.trim();
  const tno = normTable($("#pos-table-no").value);
  if (!staff) return toast("กรุณาใส่ชื่อพนักงานรับออเดอร์");
  if (!tno) return toast("กรุณาใส่เบอร์โต๊ะ");
  const hotel = POS.customerType === "hotel";
  const room = ($("#pos-room").value || "").trim();
  if (hotel && !room) return toast("กรุณาใส่เลขห้องของลูกค้าโรงแรม");
  POS.staff = staff; localStorage.setItem("ss_staff", staff);
  const btn = $("#btn-open-table");
  if (btn.disabled) return;               // กันกดซ้ำระหว่างรอ server
  btn.disabled = true;
  showLoading("กำลังเปิดโต๊ะ...");
  const res = await call("openTable", { tableNo: tno, staff, customerType: POS.customerType, roomNo: hotel ? room : "" });
  hideLoading();
  btn.disabled = false;
  if (!res) return;
  if (!res.ok) {
    toast(res.message || "เปิดโต๊ะไม่สำเร็จ");
    if (res.code === "TABLE_OPEN") await refreshBills(true);   // อัปเดตรายการโต๊ะให้เห็นโต๊ะที่ถูกเปิดไปแล้ว
    return;
  }
  $("#pos-table-no").value = "";
  POS.roomNo = hotel ? room : "";
  startOrder(res.billId, res.tableNo || tno, true);
};

/* ============================ POS: ORDER ============================ */
function startOrder(billId, tno, isNew) {
  POS.billId = billId; POS.tableNo = tno; POS.isNewTable = !!isNew;
  POS.cart = []; POS.q = ""; POS.cat = "all"; POS.period = "all";
  $("#pos-search").value = "";
  $("#pos-order-title").textContent = (isNew ? "เปิดโต๊ะ · " : "สั่งเพิ่ม · ") + "โต๊ะ " + tno + (POS.customerType === "hotel" ? " · 🏨 ห้อง " + POS.roomNo : "");
  renderPosChips(); renderPosMenu(); renderCart();
  posView("order");
}
$("#btn-order-back").onclick = async () => {
  if (POS.cart.length && !confirm("ยังมีรายการที่ยังไม่ยืนยัน ต้องการออกและทิ้งรายการ?")) return;
  POS.cart = [];
  if (POS.isNewTable && POS.billId) {      // เพิ่งเปิดโต๊ะแต่ยังไม่สั่ง → คืนเลขโต๊ะ ไม่ให้ค้าง
    showLoading("กำลังยกเลิกโต๊ะ...");
    const res = await call("cancelTable", { billId: POS.billId });
    hideLoading();
    if (res && !res.ok) toast(res.message || "ยกเลิกโต๊ะไม่สำเร็จ");
    POS.isNewTable = false; POS.billId = null;
    await refreshBills(true);
    posView("tables");
    return;
  }
  posView(POS.billId ? "detail" : "tables");
};

function renderPosChips() {
  const pr = $("#pos-period-chips"); pr.innerHTML = "";
  [["all", "ทุกช่วง"], ["lunch", "☀️ กลางวัน"], ["dinner", "🌙 กลางคืน"]].forEach(([p, l]) => {
    const c = document.createElement("button");
    c.className = "chip" + (POS.period === p ? " active" : ""); c.textContent = l;
    c.onclick = () => { POS.period = p; POS.cat = "all"; renderPosChips(); renderPosMenu(); };
    pr.appendChild(c);
  });
  const used = new Set(periodItems().map(i => i.category_th));
  const cr = $("#pos-cat-chips"); cr.innerHTML = "";
  const mk = (label, key) => {
    const c = document.createElement("button");
    c.className = "chip" + (POS.cat === key ? " active" : ""); c.textContent = label;
    c.onclick = () => { POS.cat = key; renderPosChips(); renderPosMenu(); };
    cr.appendChild(c);
  };
  mk(t("all"), "all");
  state.categories.filter(c => used.has(c.th)).forEach(c => mk(categoryLabel(c), c.th));
}
function periodItems() {
  return state.items.filter(i => POS.period === "all" || i.period === POS.period || i.period === "both");
}
function posItems() {
  const q = POS.q.toLowerCase();
  return periodItems().filter(i => {
    if (POS.cat !== "all" && i.category_th !== POS.cat) return false;
    if (!q) return true;
    return [i.name_th, i.name_en, i.name_zh, i.name_ru].join(" ").toLowerCase().includes(q);
  });
}
$("#pos-search").addEventListener("input", e => { POS.q = e.target.value.trim(); renderPosMenu(); });

function qtyInCart(itemId) { return POS.cart.filter(l => l.itemId === itemId).reduce((s, l) => s + l.qty, 0); }

function renderPosMenu() {
  const wrap = $("#pos-menu");
  const list = posItems();
  if (!list.length) { wrap.innerHTML = `<div class="empty-state" style="padding:30px 10px;">ไม่พบเมนู</div>`; return; }
  wrap.innerHTML = list.map(i => {
    const n = qtyInCart(i.id);
    const sub = i.name_en ? `<span class="pos-sub">${escapeHtml(i.name_en)}</span>` : "";
    return `<button class="pos-row" data-id="${escapeHtml(i.id)}">
      <span class="pos-name">${escapeHtml(i.name_th)}${sub}</span>
      <span class="pos-price">฿${fmt(i.price)}</span>
      <span class="pos-add">${n ? n : "+"}</span>
    </button>`;
  }).join("");
  wrap.querySelectorAll("[data-id]").forEach(b => b.onclick = () => addToCart(b.dataset.id));
}
function addToCart(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  const same = POS.cart.find(l => l.itemId === itemId && !l.note);
  if (same) same.qty++;
  else POS.cart.push({ itemId, name: item.name_th, price: Number(item.price), qty: 1, note: "" });
  renderPosMenu(); renderCart();
}
function cartTotal() { return POS.cart.reduce((s, l) => s + l.price * l.qty, 0); }

function renderCart() {
  const box = $("#pos-cart");
  const count = POS.cart.reduce((s, l) => s + l.qty, 0);
  $("#pos-cart-count").textContent = count;
  $("#pos-cart-total").textContent = "฿" + fmt(cartTotal());
  $("#btn-review-order").disabled = !count;
  if (!POS.cart.length) { box.innerHTML = ""; box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.innerHTML = `<div class="cart-title">รายการที่เลือก</div>` + POS.cart.map((l, idx) => `
    <div class="cart-line">
      <div class="cl-top">
        <span class="cl-name">${escapeHtml(l.name)}</span>
        <span class="cl-sum">฿${fmt(l.price * l.qty)}</span>
      </div>
      <div class="cl-bot">
        <div class="qty">
          <button data-dec="${idx}">−</button><b>${l.qty}</b><button data-inc="${idx}">+</button>
        </div>
        <input type="text" class="cl-note" data-note="${idx}" placeholder="หมายเหตุ เช่น ไม่เผ็ด / ไม่ใส่ผัก" value="${escapeHtml(l.note)}">
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-inc]").forEach(b => b.onclick = () => { POS.cart[+b.dataset.inc].qty++; renderPosMenu(); renderCart(); });
  box.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => {
    const l = POS.cart[+b.dataset.dec];
    if (--l.qty <= 0) POS.cart.splice(+b.dataset.dec, 1);
    renderPosMenu(); renderCart();
  });
  box.querySelectorAll("[data-note]").forEach(inp => inp.addEventListener("input", () => {
    POS.cart[+inp.dataset.note].note = inp.value;
  }));
}

/* ---- ยืนยันรับออเดอร์ ---- */
$("#btn-review-order").onclick = () => {
  if (!POS.cart.length) return;
  const staff = POS.staff || ($("#pos-staff").value || "").trim();
  $("#pos-confirm-body").innerHTML = `
    <div class="sum-meta"><span>ผู้รับออเดอร์</span><b>${escapeHtml(staff)}</b></div>
    <div class="sum-meta"><span>โต๊ะ</span><b>${escapeHtml(POS.tableNo)}</b></div>
    <div class="sum-meta"><span>ลูกค้า</span><b>${POS.customerType === "hotel" ? "🏨 โรงแรม ห้อง " + escapeHtml(POS.roomNo) : "ลูกค้านอก"}</b></div>
    <div class="sum-lines">
      ${POS.cart.map(l => `
        <div class="sum-line">
          <div><b>${l.qty} ×</b> ${escapeHtml(l.name)}${l.note ? `<div class="sum-note">📝 ${escapeHtml(l.note)}</div>` : ""}</div>
          <div>฿${fmt(l.price * l.qty)}</div>
        </div>`).join("")}
    </div>
    <div class="sum-total"><span>รวมรอบนี้</span><b>฿${fmt(cartTotal())}</b></div>`;
  openModal("pos-confirm");
};
$("#btn-confirm-cancel").onclick = () => closeModal("pos-confirm");
$("#btn-confirm-ok").onclick = async () => {
  const staff = POS.staff || ($("#pos-staff").value || "").trim();
  const lines = POS.cart.map(l => ({ itemId: l.itemId, qty: l.qty, note: l.note.trim() }));
  showLoading("กำลังบันทึกออเดอร์...");
  const res = await call("addToBill", { billId: POS.billId, staff, lines });
  hideLoading();
  if (!res) return;
  closeModal("pos-confirm");
  if (!res.ok) {
    toast(res.message || "บันทึกไม่สำเร็จ");
    if (res.code === "BILL_CLOSED") { POS.cart = []; POS.isNewTable = false; POS.billId = null; await refreshBills(true); posView("tables"); }
    return;
  }
  toast("รับออเดอร์เรียบร้อย ✔ ส่งเข้าเครื่องพิมพ์แล้ว");
  POS.cart = []; POS.isNewTable = false;
  setCustomer("outside");
  await refreshBills(true);
  posView("tables");
};

/* ============================ POS: TABLE DETAIL ============================ */
function currentBill() { return POS.bills.find(b => b.billId === POS.detailId); }

function openDetail(billId) {
  POS.detailId = billId;
  renderDetail();
  posView("detail");
}
function renderDetail() {
  const b = currentBill();
  if (!b) { posView("tables"); return; }
  $("#pos-detail-title").textContent = "โต๊ะ " + b.tableNo;
  const empty = !(b.lines || []).length;
  $("#btn-cancel-table").classList.toggle("hidden", !empty);
  $("#btn-checkout").classList.toggle("hidden", empty);
  const rounds = {};
  (b.lines || []).forEach(l => { (rounds[l.round] = rounds[l.round] || []).push(l); });
  $("#pos-detail-body").innerHTML =
    `<div class="sum-meta"><span>เปิดโดย</span><b>${escapeHtml(b.staff)}</b></div>` +
    `<div class="sum-meta"><span>ลูกค้า</span><b>${b.customerType === "hotel" ? "🏨 โรงแรม ห้อง " + escapeHtml(b.roomNo) : "ลูกค้านอก"}</b></div>` +
    Object.keys(rounds).sort((a, c) => a - c).map(r => `
      <div class="round-title">รอบที่ ${r}</div>
      <div class="sum-lines">${rounds[r].map(l => `
        <div class="sum-line">
          <div><b>${l.qty} ×</b> ${escapeHtml(l.name)}${l.note ? `<div class="sum-note">📝 ${escapeHtml(l.note)}</div>` : ""}</div>
          <div>฿${fmt(l.price * l.qty)}</div>
        </div>`).join("")}</div>`).join("") +
    `<div class="sum-total"><span>ยอดรวม</span><b>฿${fmt(b.subtotal)}</b></div>`;
}
$("#btn-detail-back").onclick = () => posView("tables");
$("#btn-cancel-table").onclick = async () => {
  const b = currentBill(); if (!b) return;
  if (!confirm("ยกเลิกโต๊ะ " + b.tableNo + " ? (ยังไม่มีรายการอาหาร)")) return;
  showLoading("กำลังยกเลิกโต๊ะ...");
  const res = await call("cancelTable", { billId: b.billId });
  hideLoading();
  if (res && !res.ok) toast(res.message || "ยกเลิกโต๊ะไม่สำเร็จ");
  await refreshBills(true);
  posView("tables");
};
$("#btn-add-more").onclick = () => {
  const b = currentBill(); if (!b) return;
  if (!POS.staff) POS.staff = b.staff;
  POS.customerType = b.customerType || "outside"; POS.roomNo = b.roomNo || "";
  startOrder(b.billId, b.tableNo);
};

/* ============================ POS: CHECKOUT ============================ */
function calcBill() {
  const b = currentBill();
  const sub = b ? Number(b.subtotal) : 0;
  const pct = Math.min(100, Math.max(0, Number(POS.discount) || 0));
  const disc = Math.round(sub * pct) / 100;
  return { sub, pct, disc, total: Math.round((sub - disc) * 100) / 100 };
}
$("#btn-checkout").onclick = () => {
  POS.payMethod = ""; POS.discount = 0;
  $("#pos-discount").value = "";
  renderCheckout();
  openModal("pos-checkout");
};
function renderCheckout() {
  const c = calcBill();
  const cb = currentBill() || {};
  const isHotel = cb.customerType === "hotel";
  if (!isHotel && POS.payMethod === "room") POS.payMethod = "";   // ลงห้องได้เฉพาะลูกค้าโรงแรม
  $("#co-table").textContent = "โต๊ะ " + cb.tableNo + (isHotel ? " · 🏨 ห้อง " + cb.roomNo : "");
  $("#co-sub").textContent = "฿" + fmt(c.sub);
  $("#co-disc").textContent = c.pct ? `−฿${fmt(c.disc)} (${c.pct}%)` : "฿0";
  $("#co-total").textContent = "฿" + fmt(c.total);
  $$("#co-quick .chip").forEach(ch => ch.classList.toggle("active", Number(ch.dataset.pct) === c.pct));
  $$("#co-methods .pay-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.m === POS.payMethod);
    if (b.dataset.m === "room") { b.disabled = !isHotel; b.style.opacity = isHotel ? "" : ".4"; }
  });
  const qr = $("#co-qr");
  if (POS.payMethod === "qr") {
    qr.classList.remove("hidden");
    qr.innerHTML = POS.qrUrl
      ? `<img src="${escapeHtml(POS.qrUrl)}" alt="QR"><div class="qr-amt">ยอดชำระ ฿${fmt(c.total)}</div>`
      : `<div class="empty-state" style="padding:14px;">ยังไม่ได้ตั้งรูป QR — ไปที่เมนูพนักงาน › ตั้งค่ารูป QR</div>`;
  } else { qr.classList.add("hidden"); qr.innerHTML = ""; }
  $("#btn-pay-ok").disabled = !POS.payMethod;
}
$("#pos-discount").addEventListener("input", e => { POS.discount = e.target.value; renderCheckout(); });
$$("#co-quick .chip").forEach(ch => ch.onclick = () => {
  POS.discount = Number(ch.dataset.pct);
  $("#pos-discount").value = POS.discount || "";
  renderCheckout();
});
$$("#co-methods .pay-btn").forEach(b => b.onclick = () => { POS.payMethod = b.dataset.m; renderCheckout(); });
$("#btn-pay-cancel").onclick = () => closeModal("pos-checkout");
$("#btn-pay-ok").onclick = async () => {
  const b = currentBill(); if (!b || !POS.payMethod) return;
  const c = calcBill();
  showLoading("กำลังเช็คบิล...");
  const res = await call("checkBill", { billId: b.billId, method: POS.payMethod, discountPct: c.pct });
  hideLoading();
  if (!res) return;
  if (!res.ok) return toast(res.message || "เช็คบิลไม่สำเร็จ");
  closeModal("pos-checkout");
  toast(`เช็คบิลโต๊ะ ${b.tableNo} แล้ว · ฿${fmt(res.total)} · ${PAY_LABEL[POS.payMethod]}`);
  await refreshBills(true);
  posView("tables");
};

/* ============================ ADMIN: หมวดหมู่ + ประเภท (อาหาร/เครื่องดื่ม) ============================
   override ฟังก์ชันของ app.js เพื่อเพิ่มปุ่มสลับประเภท
   (🍳 อาหาร → เครื่องพิมพ์ครัว, 🥤 เครื่องดื่ม → เครื่องพิมพ์บาร์) */
function renderCategoryTagList() {
  const wrap = $("#category-tag-list");
  wrap.innerHTML = "";
  state.categories.forEach(c => {
    const parts = [c.th, c.en, c.zh, c.ru].filter(Boolean).join(" / ");
    const st = c.station === "drink" ? "drink" : "food";
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `<button class="st-btn" data-st="${escapeHtml(c.th)}" data-cur="${st}" title="แตะเพื่อสลับ อาหาร/เครื่องดื่ม">${st === "drink" ? "🥤" : "🍳"}</button>${escapeHtml(parts)} <button data-cat="${escapeHtml(c.th)}">✕</button>`;
    wrap.appendChild(tag);
  });
  wrap.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => removeCategory(b.dataset.cat));
  wrap.querySelectorAll("[data-st]").forEach(b => b.onclick = async () => {
    const next = b.dataset.cur === "drink" ? "food" : "drink";
    showLoading("กำลังบันทึก...");
    const res = await call("setCategoryStation", { category_th: b.dataset.st, station: next });
    hideLoading();
    if (res && res.ok) { state.categories = res.categories; renderCategoryTagList(); }
    else if (res) toast(res.message || "ไม่สำเร็จ");
  });
}

/* ============================ ประเภทลูกค้า (ลูกค้านอก / ลูกค้าโรงแรม + เลขห้อง) ============================ */
function setCustomer(type) {
  POS.customerType = type;
  if (type !== "hotel") { POS.roomNo = ""; $("#pos-room").value = ""; }
  $$("#pos-cust .pay-btn").forEach(b => b.classList.toggle("active", b.dataset.c === type));
  $("#pos-room-wrap").classList.toggle("hidden", type !== "hotel");
}
$$("#pos-cust .pay-btn").forEach(b => b.onclick = () => setCustomer(b.dataset.c));
setCustomer("outside");
