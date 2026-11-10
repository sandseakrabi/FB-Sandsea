/* ===========================================================
   SandSea Restaurant — rs.js  (Room Service)
   1) หน้าลูกค้า: เลือกเมนู Room Service เอง + หมายเหตุ + ชื่อ/เบอร์ห้อง → ส่งออเดอร์ (ไม่พิมพ์อัตโนมัติ)
   2) ฝั่งพนักงาน: เช็คออเดอร์ใหม่อัตโนมัติ + เสียง/สั่น/ป้ายเตือน
   โหลดต่อจาก app.js และ pos.js (ใช้ $, $$, state, I18N, t, toast, show, showLoading, hideLoading,
   apiPost, escapeHtml, localize, categoryLabel, openLightbox, POS, renderTables)
=========================================================== */
(function () {
  "use strict";

  /* ---------------- ข้อความ 4 ภาษา ---------------- */
  const STR = {
    th: {
      roomService: "Room Service", roomServiceSub: "สั่งอาหารถึงห้องพัก",
      rsTitle: "สั่งอาหารเข้าห้องพัก", rsNote: "🛎️ ราคา Room Service · พนักงานจะโทรยืนยันที่ห้องก่อนเริ่มทำอาหาร",
      rsMyOrder: "รายการที่เลือก", rsNotePh: "หมายเหตุ เช่น ไม่เผ็ด / ไม่ใส่ผัก",
      rsGeneralNote: "หมายเหตุเพิ่มเติมถึงครัว (ถ้ามี)", rsGuestName: "ชื่อผู้สั่ง *", rsRoomNo: "เบอร์ห้อง *",
      rsReview: "ตรวจสอบคำสั่งซื้อ", rsConfirmTitle: "ยืนยันคำสั่งซื้อ", rsEdit: "กลับไปแก้ไข", rsSubmit: "✔ ยืนยันคำสั่ง",
      rsTotal: "รวม", rsItemsCount: "รายการ",
      rsNeedInfo: "กรุณากรอกชื่อและเบอร์ห้อง", rsNeedItems: "กรุณาเลือกเมนูอย่างน้อย 1 รายการ",
      rsFail: "ส่งคำสั่งไม่สำเร็จ กรุณาลองอีกครั้ง หรือโทรติดต่อร้าน",
      rsErrMenu: "เมนูเพิ่งมีการอัปเดต กรุณาตรวจสอบรายการอีกครั้ง",
      rsErrMany: "คุณมีออเดอร์ที่รอการยืนยันอยู่แล้ว กรุณารอพนักงานโทรกลับ",
      rsSending: "กำลังส่งคำสั่ง...", rsDoneTitle: "ส่งคำสั่งเรียบร้อย",
      rsDoneMsg: "พนักงานจะโทรติดต่อห้อง {room} เพื่อยืนยันคำสั่งก่อนเริ่มทำอาหาร",
      rsHome: "กลับหน้าหลัก", rsEmpty: "ยังไม่มีเมนู Room Service", rsLeave: "ทิ้งรายการที่เลือกและออก?"
    },
    en: {
      roomService: "Room Service", roomServiceSub: "Order to your room",
      rsTitle: "Room Service", rsNote: "🛎️ Room Service prices · our staff will call your room to confirm before we start cooking",
      rsMyOrder: "Your selection", rsNotePh: "Note, e.g. no spice",
      rsGeneralNote: "Additional note for the kitchen (optional)", rsGuestName: "Your name *", rsRoomNo: "Room number *",
      rsReview: "Review order", rsConfirmTitle: "Confirm your order", rsEdit: "Back to edit", rsSubmit: "✔ Place order",
      rsTotal: "Total", rsItemsCount: "items",
      rsNeedInfo: "Please enter your name and room number", rsNeedItems: "Please select at least one item",
      rsFail: "Could not send your order. Please try again or call the restaurant.",
      rsErrMenu: "The menu has just been updated. Please review your order again.",
      rsErrMany: "You already have orders waiting for confirmation. Please wait for our call.",
      rsSending: "Sending your order...", rsDoneTitle: "Order received",
      rsDoneMsg: "Our staff will call room {room} to confirm your order before we start preparing it.",
      rsHome: "Back to home", rsEmpty: "No Room Service items available yet", rsLeave: "Discard your selected items and leave?"
    },
    zh: {
      roomService: "客房送餐", roomServiceSub: "餐点送到房间",
      rsTitle: "客房送餐", rsNote: "🛎️ 客房送餐价格 · 开始制作前，工作人员会致电您的房间确认",
      rsMyOrder: "已选菜品", rsNotePh: "备注，例如：不要辣",
      rsGeneralNote: "给厨房的补充备注（选填）", rsGuestName: "您的姓名 *", rsRoomNo: "房间号 *",
      rsReview: "核对订单", rsConfirmTitle: "确认订单", rsEdit: "返回修改", rsSubmit: "✔ 确认下单",
      rsTotal: "合计", rsItemsCount: "项",
      rsNeedInfo: "请填写姓名和房间号", rsNeedItems: "请至少选择一道菜品",
      rsFail: "订单发送失败，请重试或致电餐厅。",
      rsErrMenu: "菜单刚刚更新，请重新核对您的订单。",
      rsErrMany: "您已有待确认的订单，请等待我们来电。",
      rsSending: "正在发送订单...", rsDoneTitle: "已收到订单",
      rsDoneMsg: "工作人员将致电 {room} 房间确认订单，确认后才会开始制作。",
      rsHome: "返回首页", rsEmpty: "暂无客房送餐菜品", rsLeave: "放弃已选菜品并离开？"
    },
    ru: {
      roomService: "Рум-сервис", roomServiceSub: "Заказ в номер",
      rsTitle: "Рум-сервис", rsNote: "🛎️ Цены рум-сервиса · перед приготовлением сотрудник позвонит в номер для подтверждения",
      rsMyOrder: "Выбранные блюда", rsNotePh: "Пожелание, напр. не острое",
      rsGeneralNote: "Дополнительный комментарий для кухни (необязательно)", rsGuestName: "Ваше имя *", rsRoomNo: "Номер комнаты *",
      rsReview: "Проверить заказ", rsConfirmTitle: "Подтверждение заказа", rsEdit: "Назад к редактированию", rsSubmit: "✔ Оформить заказ",
      rsTotal: "Итого", rsItemsCount: "поз.",
      rsNeedInfo: "Укажите имя и номер комнаты", rsNeedItems: "Выберите хотя бы одно блюдо",
      rsFail: "Не удалось отправить заказ. Повторите попытку или позвоните в ресторан.",
      rsErrMenu: "Меню только что обновилось. Проверьте заказ ещё раз.",
      rsErrMany: "У вас уже есть заказы, ожидающие подтверждения. Дождитесь нашего звонка.",
      rsSending: "Отправляем заказ...", rsDoneTitle: "Заказ получен",
      rsDoneMsg: "Сотрудник позвонит в номер {room}, чтобы подтвердить заказ, прежде чем мы начнём готовить.",
      rsHome: "На главную", rsEmpty: "Блюд для рум-сервиса пока нет", rsLeave: "Отменить выбранные блюда и выйти?"
    }
  };
  Object.keys(STR).forEach(l => Object.assign(I18N[l], STR[l]));
  applyStaticTranslations();   // app.js แปลข้อความไปแล้วก่อนที่ไฟล์นี้จะเพิ่มคำใหม่ → แปลซ้ำ

  /* ============================ หน้าลูกค้า ============================ */
  const RS = { cart: [], cat: "all", reqId: "", busy: false };
  const money = n => "฿" + Number(n || 0).toLocaleString("en-US");
  const rsItems = () => state.items.filter(i => i.roomService && Number(i.rsPrice) > 0);
  const findItem = id => state.items.find(i => i.id === id);
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function openRs() {
    RS.cat = "all";
    $("#rs-order").classList.remove("hidden");
    $("#rs-done").classList.add("hidden");
    renderRs();
    show("screen-rs");
  }
  $("#btn-rs").onclick = openRs;
  $("#btn-rs-back").onclick = () => {
    if (RS.cart.length && !confirm(t("rsLeave"))) return;
    RS.cart = []; RS.reqId = "";
    show("screen-home");
  };
  $("#btn-rs-home").onclick = () => show("screen-home");

  function renderRs() {
    renderRsChips(); renderRsMenu(); renderRsCart();
  }

  function renderRsChips() {
    const used = new Set(rsItems().map(i => i.category_th));
    const row = $("#rs-cat-chips"); row.innerHTML = "";
    const mk = (label, key) => {
      const c = document.createElement("button");
      c.className = "chip" + (RS.cat === key ? " active" : ""); c.textContent = label;
      c.onclick = () => { RS.cat = key; renderRsChips(); renderRsMenu(); };
      row.appendChild(c);
    };
    mk(t("all"), "all");
    state.categories.filter(c => used.has(c.th)).forEach(c => mk(categoryLabel(c), c.th));
  }

  const qtyOf = id => RS.cart.filter(l => l.itemId === id).reduce((s, l) => s + l.qty, 0);

  function renderRsMenu() {
    const wrap = $("#rs-menu");
    let list = rsItems();
    if (RS.cat !== "all") list = list.filter(i => i.category_th === RS.cat);
    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">🛎️</div>${escapeHtml(t("rsEmpty"))}</div>`;
      return;
    }
    wrap.innerHTML = list.map(i => {
      const name = localize(i, "name"), desc = localize(i, "description"), n = qtyOf(i.id);
      return `<div class="rs-item">
        <div class="rs-thumb"${i.imageUrl ? ` data-zoom="${escapeHtml(i.id)}"` : ""}>${i.imageUrl ? `<img src="${escapeHtml(i.imageUrl)}" alt="${escapeHtml(name)}" loading="lazy">` : "🍽️"}</div>
        <div class="rs-info">
          <div class="rs-name">${escapeHtml(name)}</div>
          ${desc ? `<div class="rs-desc">${escapeHtml(desc)}</div>` : ""}
          <div class="rs-price">${money(i.rsPrice)}</div>
        </div>
        <div class="rs-ctrl">${n
          ? `<button data-dec="${escapeHtml(i.id)}" aria-label="−">−</button><b>${n}</b><button data-inc="${escapeHtml(i.id)}" aria-label="+">+</button>`
          : `<button class="rs-add" data-inc="${escapeHtml(i.id)}" aria-label="+">+</button>`}</div>
      </div>`;
    }).join("");
  }
  $("#rs-menu").addEventListener("click", e => {
    const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), z = e.target.closest("[data-zoom]");
    if (inc) addItem(inc.dataset.inc);
    else if (dec) decItem(dec.dataset.dec);
    else if (z) { const it = findItem(z.dataset.zoom); if (it) openLightbox(it.imageUrl, localize(it, "name")); }
  });

  function addItem(id) {
    if (!findItem(id)) return;
    const same = RS.cart.find(l => l.itemId === id && !l.note);
    if (same) same.qty = Math.min(99, same.qty + 1); else RS.cart.push({ itemId: id, qty: 1, note: "" });
    renderRsMenu(); renderRsCart();
  }
  function decItem(id) {
    for (let k = RS.cart.length - 1; k >= 0; k--) {
      if (RS.cart[k].itemId !== id) continue;
      if (--RS.cart[k].qty <= 0) RS.cart.splice(k, 1);
      break;
    }
    renderRsMenu(); renderRsCart();
  }
  const unit = l => { const it = findItem(l.itemId); return it ? Number(it.rsPrice) : 0; };
  const cartTotal = () => RS.cart.reduce((s, l) => s + unit(l) * l.qty, 0);

  function renderRsCart() {
    const box = $("#rs-cart");
    const count = RS.cart.reduce((s, l) => s + l.qty, 0);
    $("#rs-cart-count").textContent = count;
    $("#rs-cart-total").textContent = money(cartTotal());
    $("#btn-rs-review").disabled = !count;
    if (!RS.cart.length) { box.innerHTML = ""; box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    box.innerHTML = `<div class="rs-cart-title">${escapeHtml(t("rsMyOrder"))}</div>` + RS.cart.map((l, idx) => {
      const it = findItem(l.itemId);
      return `<div class="rs-line">
        <div class="rs-line-top"><span>${escapeHtml(it ? localize(it, "name") : "")}</span><b>${money(unit(l) * l.qty)}</b></div>
        <div class="rs-line-bot">
          <div class="rs-qty"><button data-ldec="${idx}">−</button><b>${l.qty}</b><button data-linc="${idx}">+</button></div>
          <input type="text" data-lnote="${idx}" maxlength="120" placeholder="${escapeHtml(t("rsNotePh"))}" value="${escapeHtml(l.note)}">
        </div>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-linc]").forEach(b => b.onclick = () => { const l = RS.cart[+b.dataset.linc]; l.qty = Math.min(99, l.qty + 1); renderRsMenu(); renderRsCart(); });
    box.querySelectorAll("[data-ldec]").forEach(b => b.onclick = () => {
      const k = +b.dataset.ldec;
      if (--RS.cart[k].qty <= 0) RS.cart.splice(k, 1);
      renderRsMenu(); renderRsCart();
    });
    box.querySelectorAll("[data-lnote]").forEach(inp => inp.addEventListener("input", () => { RS.cart[+inp.dataset.lnote].note = inp.value; }));
  }

  /* ---- ยืนยัน / ส่งออเดอร์ ---- */
  $("#btn-rs-review").onclick = () => {
    if (!RS.cart.length) return toast(t("rsNeedItems"));
    try {
      const g = JSON.parse(sessionStorage.getItem("ss_rs_guest") || "{}");
      if (!$("#rs-name").value && g.name) $("#rs-name").value = g.name;
      if (!$("#rs-room").value && g.room) $("#rs-room").value = g.room;
    } catch (e) {}
    $("#rs-confirm-body").innerHTML = `<div class="rs-sum">` + RS.cart.map(l => {
      const it = findItem(l.itemId);
      return `<div class="rs-sum-line"><div><b>${l.qty} ×</b> ${escapeHtml(it ? localize(it, "name") : "")}${l.note ? `<div class="rs-sum-note">📝 ${escapeHtml(l.note)}</div>` : ""}</div><div>${money(unit(l) * l.qty)}</div></div>`;
    }).join("") + `<div class="rs-sum-total"><span>${escapeHtml(t("rsTotal"))}</span><b>${money(cartTotal())}</b></div></div>`;
    $("#rs-confirm").classList.remove("hidden");
  };
  $("#btn-rs-edit").onclick = () => $("#rs-confirm").classList.add("hidden");

  $("#btn-rs-submit").onclick = async () => {
    if (RS.busy) return;
    const name = $("#rs-name").value.trim(), room = $("#rs-room").value.trim();
    if (!name || !room) return toast(t("rsNeedInfo"));
    if (!RS.cart.length) return toast(t("rsNeedItems"));
    RS.busy = true; $("#btn-rs-submit").disabled = true;
    if (!RS.reqId) RS.reqId = uuid();           // reqId เดิมถ้ากดซ้ำ → server ไม่สร้างบิลซ้ำ
    showLoading(t("rsSending"));
    try {
      const res = await apiPost({
        action: "rsOrder", reqId: RS.reqId, guestName: name, roomNo: room,
        orderNote: $("#rs-gnote").value.trim(),
        lines: RS.cart.map(l => ({ itemId: l.itemId, qty: l.qty, note: l.note.trim() }))
      });
      hideLoading();
      if (res && res.ok) {
        try { sessionStorage.setItem("ss_rs_guest", JSON.stringify({ name, room })); } catch (e) {}
        $("#rs-confirm").classList.add("hidden");
        $("#rs-gnote").value = "";
        RS.cart = []; RS.reqId = "";
        $("#rs-done-msg").textContent = t("rsDoneMsg").replace("{room}", room.toUpperCase());
        $("#rs-order").classList.add("hidden");
        $("#rs-done").classList.remove("hidden");
        window.scrollTo({ top: 0 });
      } else if (res && res.code === "MENU_CHANGED") {
        RS.reqId = ""; toast(t("rsErrMenu"));
        $("#rs-confirm").classList.add("hidden");
        await loadMenuData();
        RS.cart = RS.cart.filter(l => { const it = findItem(l.itemId); return it && it.roomService && Number(it.rsPrice) > 0; });
        renderRs();
      } else if (res && res.code === "TOO_MANY") {
        toast(t("rsErrMany"));
      } else {
        toast((res && res.code === "BAD_INPUT") ? t("rsNeedInfo") : t("rsFail"));
      }
    } catch (e) {
      hideLoading(); toast(t("rsFail"));       // เก็บ reqId ไว้ ถ้ากดส่งใหม่ก็ไม่สร้างซ้ำ
    } finally { RS.busy = false; $("#btn-rs-submit").disabled = false; }
  };

  // สลับภาษาตอนอยู่หน้า Room Service → วาดใหม่
  document.addEventListener("langChange", () => {
    if (!$("#screen-rs").classList.contains("hidden")) { renderRs(); if (!$("#rs-confirm").classList.contains("hidden")) $("#btn-rs-review").onclick(); }
  });

  /* ============================ ฝั่งพนักงาน: แจ้งเตือนออเดอร์ใหม่ ============================ */
  const seen = new Set();
  let baseline = false, inflight = false;
  const pendingList = () => (POS.bills || []).filter(b => b.channel === "roomservice" && b.rsStatus === "pending");

  function updateBadge() {
    const el = $("#rs-badge"); if (!el) return;
    const n = pendingList().length;
    el.textContent = n; el.classList.toggle("hidden", !n);
  }
  window.updateRsBadge = updateBadge;

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = new AC();
      [880, 1175, 880].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(), st = c.currentTime + i * 0.28;
        o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.25, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.24);
        o.start(st); o.stop(st + 0.26);
      });
      setTimeout(() => { try { c.close(); } catch (e) {} }, 1500);
    } catch (e) {}
  }

  async function poll() {
    if (!state.adminToken) { baseline = false; return; }
    if (document.hidden || inflight) return;
    if (!$("#loading-overlay").classList.contains("hidden")) return;   // กำลังบันทึกอะไรอยู่ ไม่รบกวน
    inflight = true;
    try {
      const res = await apiPost({ action: "getOpenBills", token: state.adminToken });
      if (!res || !res.ok) return;                                       // เน็ตหลุด/เซสชันหมดอายุ: เงียบไว้ ให้การกดครั้งถัดไปแจ้งเอง
      POS.bills = res.bills || []; POS.qrUrl = res.qrUrl || POS.qrUrl;
      const pend = pendingList();
      const fresh = pend.filter(b => !seen.has(b.billId));
      pend.forEach(b => seen.add(b.billId));
      renderTables();
      if (baseline && fresh.length) {
        beep();
        if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
        toast("🛎️ Room Service ใหม่ · ห้อง " + fresh.map(b => b.roomNo).join(", "));
      }
      baseline = true;
    } catch (e) { /* ออฟไลน์ชั่วคราว */ }
    finally { inflight = false; }
  }
  setInterval(poll, 12000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  setTimeout(poll, 2000);
})();
