/* SandSea Print Agent
   รันบนคอม/มินิพีซี/Raspberry Pi ที่อยู่ในวง LAN เดียวกับเครื่องพิมพ์ (เปิดทิ้งไว้ตลอด)
   - ดึงคิวจาก Apps Script ทุก pollMs มิลลิวินาที
   - ส่งคำสั่ง ESC/POS ตรงเข้า IP:9100 ของเครื่องพิมพ์ (ไม่ต้องใช้ไดรเวอร์ Windows)
   - พิมพ์สำเร็จแล้วค่อยแจ้ง ack; ถ้าพิมพ์ไม่ติดจะลองใหม่รอบถัดไป
   ใช้: node agent.js          (ทำงานปกติ)
        node agent.js --test   (พิมพ์หน้าทดสอบทุกเครื่อง) */
const net = require("net");
const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const ENC = cfg.encoding || "win874";
const PAYLABEL = { cash: "เงินสด", credit: "บัตรเครดิต", room: "ลงห้อง", qr: "QR Code" };

/* ---------- ESC/POS builder ---------- */
const ESC = 0x1b, GS = 0x1d;
const isComb = c => c === 0x0e31 || (c >= 0x0e34 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e); // สระ/วรรณยุกต์ลอย กว้าง 0
const dispW = s => { let w = 0; for (const ch of s) if (!isComb(ch.codePointAt(0))) w++; return w; };
const padR = (s, n) => s + " ".repeat(Math.max(0, n - dispW(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - dispW(s))) + s;
function wrap(text, width) {
  const out = []; let cur = "", w = 0;
  for (const ch of String(text)) {
    const comb = isComb(ch.codePointAt(0));
    if (!comb && w >= width) { out.push(cur); cur = ""; w = 0; }
    cur += ch; if (!comb) w++;
  }
  if (cur) out.push(cur);
  return out;
}
const baht = n => Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtTime = ms => new Date(Number(ms)).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

class Ticket {
  constructor(p) {
    this.cols = p.cols || 48;
    this.b = [];
    this.raw([ESC, 0x40]);                           // init
    this.cp = (p.codepage == null ? 255 : Number(p.codepage)) & 0xff;   // เบอร์ตารางของเครื่อง ไม่ใช่ 874
    if (p.codepage > 255) console.log('⚠️ codepage ต้องเป็นเลข 0-255 (เบอร์ตารางของเครื่อง) ไม่ใช่ 874 — ดู README');
    this.raw([ESC, 0x74, this.cp]);
  }
  raw(a) { this.b.push(Buffer.from(a)); return this; }
  text(s) {  // ส่งคำสั่งเลือก code page ก่อนข้อความทุกครั้ง (บางรุ่นรีเซ็ตเมื่อเปลี่ยนขนาดตัวอักษร)
    this.b.push(Buffer.from([ESC, 0x74, this.cp]));
    this.b.push(iconv.encode(s, ENC)); return this;
  }
  line(s = "") { return this.text(s).raw([0x0a]); }
  align(n) { return this.raw([ESC, 0x61, n]); }      // 0 ซ้าย 1 กลาง 2 ขวา
  bold(on) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  size(n) { return this.raw([GS, 0x21, n]); }        // 0x00 ปกติ, 0x11 กว้าง+สูง x2, 0x01 สูง x2
  rule(ch = "-") { return this.line(ch.repeat(this.cols)); }
  row(a, b) { return this.line(padR(a, this.cols - dispW(b)) + b); }   // ซ้าย...ขวา ชิดขอบ
  cut() { return this.raw([ESC, 0x64, 4]).raw([GS, 0x56, 0x42, 0x00]); }
  buffer() { return Buffer.concat(this.b); }
}

/* ---------- โหมดพิมพ์เป็นภาพ (mode:"raster") ----------
   ใช้กับเครื่องที่ไม่มีตารางภาษาไทยดีๆ ในตัว (เช่นสระลอย) — วาดข้อความด้วยฟอนต์ในคอมเป็นภาพ
   แล้วส่งเป็น bitmap ให้เครื่องพิมพ์ ไทย/อังกฤษ/จีน/รัสเซียก็พิมพ์ได้ถ้าฟอนต์รองรับ
   ตั้งค่า (ต่อเครื่อง): "mode":"raster", "fontPath", "fontBoldPath", "dots":576 */
let _canvasLib = null;
class RasterTicket {
  constructor(p) {
    _canvasLib = _canvasLib || require("@napi-rs/canvas");
    this.p = p; this.dots = p.dots || 576; this.cols = p.rasterCols || 40;
    const reg = (fp, fam) => { try { if (fp && fs.existsSync(fp)) _canvasLib.GlobalFonts.registerFromPath(fp, fam); } catch (e) {} };
    reg(p.fontPath || "C:\\Windows\\Fonts\\tahoma.ttf", "SSFont");
    reg(p.fontBoldPath || "C:\\Windows\\Fonts\\tahomabd.ttf", "SSFontBold");
    this.base = p.fontSize || 24;
    this.ops = []; this.al = 0; this.bd = false; this.wm = 1; this.hm = 1; this.cutAfter = false;
  }
  raw() { return this; }
  align(n) { this.al = n; return this; }
  bold(on) { this.bd = !!on; return this; }
  size(n) { this.wm = ((n >> 4) & 7) + 1; this.hm = (n & 7) + 1; return this; }
  text(s) { return this.line(s); }
  line(s = "") { this.ops.push({ l: s, r: null, al: this.al, bd: this.bd, wm: this.wm, hm: this.hm }); return this; }
  row(a, b) { this.ops.push({ l: a, r: b, al: 0, bd: this.bd, wm: this.wm, hm: this.hm }); return this; }
  rule() { this.ops.push({ rule: true, hm: 1 }); return this; }
  cut() { this.cutAfter = true; return this; }
  buffer() {
    const { createCanvas } = _canvasLib, W = this.dots, pad = 6;
    const lh = o => Math.round(this.base * 1.35 * (o.hm || 1));
    const H = this.ops.reduce((h, o) => h + lh(o), 0) + 20;
    const c = createCanvas(W, H), x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.fillStyle = "#000"; x.textBaseline = "alphabetic";
    let y = 0;
    for (const o of this.ops) {
      const h = lh(o); y += h;
      if (o.rule) { x.fillRect(0, y - h / 2, W, 2); continue; }
      const px = this.base * o.hm, fam = o.bd ? "SSFontBold, SSFont" : "SSFont";
      x.font = px + "px " + fam;
      const sx = o.wm / o.hm;
      const draw = (txt, al) => {
        let w = x.measureText(txt).width * sx, k = 1;
        if (w > W - 2 * pad) k = (W - 2 * pad) / w;      // ยาวเกิน → ย่อให้พอดี
        x.save();
        const xx = al === 0 ? pad : al === 1 ? (W - w * k) / 2 : W - pad - w * k;
        x.translate(xx, y - h * 0.25); x.scale(sx * k, k); x.fillText(txt, 0, 0); x.restore();
      };
      if (o.r != null) { draw(o.l, 0); draw(o.r, 2); } else draw(o.l, o.al);
    }
    // แปลงเป็น 1-bit แล้วส่งเป็นแถบๆ (GS v 0) กัน buffer เครื่องพิมพ์ล้น
    const img = x.getImageData(0, 0, W, H).data, wb = Math.ceil(W / 8), out = [Buffer.from([ESC, 0x40])];
    for (let y0 = 0; y0 < H; y0 += 200) {
      const rows = Math.min(200, H - y0), bm = Buffer.alloc(wb * rows);
      for (let r = 0; r < rows; r++) for (let px = 0; px < W; px++) {
        const i = ((y0 + r) * W + px) * 4;
        if ((img[i] * 0.3 + img[i + 1] * 0.59 + img[i + 2] * 0.11) < 150) bm[r * wb + (px >> 3)] |= 0x80 >> (px & 7);
      }
      out.push(Buffer.from([GS, 0x76, 0x30, 0x00, wb & 255, wb >> 8, rows & 255, rows >> 8]), bm);
    }
    out.push(Buffer.from([ESC, 0x64, 4]));
    if (this.cutAfter) out.push(Buffer.from([GS, 0x56, 0x42, 0x00]));
    return Buffer.concat(out);
  }
}
const mk = p => (p.mode === "raster" ? new RasterTicket(p) : new Ticket(p));

/* ---------- เลย์เอาต์ใบสั่ง ---------- */
function orderTicket(p, job, title) {
  const t = mk(p);
  const d = job.payload;
  t.align(1).bold(true).size(0x11).line(title).size(0x00).bold(false);
  t.size(0x11).bold(true).line("โต๊ะ " + d.table).size(0x00).bold(false);
  if (d.customerType === "hotel") t.bold(true).line("โรงแรม ห้อง " + d.roomNo).bold(false);
  t.align(0).rule();
  t.line("พนักงาน: " + d.staff + "   รอบที่ " + d.round);
  t.line("เวลา: " + fmtTime(d.time));
  t.rule();
  d.lines.forEach(l => {
    t.bold(true).size(0x01);
    wrap(l.qty + " x " + l.name, t.cols).forEach(x => t.line(x));
    t.size(0x00).bold(false);
    if (l.note) wrap(">> " + l.note, t.cols - 3).forEach(x => t.line("   " + x));
  });
  t.rule().cut();
  return t.buffer();
}

function billTicket(p, job) {
  const t = mk(p), d = job.payload, W = t.cols;
  t.align(1).bold(true).size(0x11).line(cfg.shopName || "SandSea").size(0x00).bold(false);
  t.line("ใบเสร็จรับเงิน");
  t.align(0).rule();
  t.line("โต๊ะ " + d.table + "   พนักงาน: " + d.staff);
  if (d.customerType === "hotel") t.line("ลูกค้าโรงแรม ห้อง " + d.roomNo);
  t.line("เวลา: " + fmtTime(d.time));
  t.rule();
  d.lines.forEach(l => {
    t.row(l.qty + " x " + l.name, baht(l.price * l.qty));
    if (l.note) t.line("   >> " + l.note);
  });
  t.rule();
  t.row("รวม", baht(d.subtotal));
  if (d.discountPct) t.row("ส่วนลด " + d.discountPct + "%", "-" + baht(d.discountAmt));
  t.bold(true).size(0x01); t.row("ยอดสุทธิ", baht(d.total)); t.size(0x00).bold(false);
  t.line("ชำระโดย: " + (PAYLABEL[d.method] || d.method));
  t.rule().align(1).line("ขอบคุณที่ใช้บริการ").line("Thank you").align(0).cut();
  return t.buffer();
}

function testTicket(p, name) {
  const t = mk(p);
  t.align(1).bold(true).size(0x11).line("TEST " + name).size(0x00).bold(false);
  t.line("ทดสอบภาษาไทย กุ้งเผา ผัดไทย น้ำเปล่า").line("1234567890 / " + fmtTime(Date.now()));
  t.line("codepage=" + (p.codepage == null ? 255 : p.codepage) + " enc=" + ENC).cut();
  return t.buffer();
}

function buildJob(printerCfg, job) {
  switch (job.type) {
    case "kitchen": return orderTicket(printerCfg, job, "** ครัว **");
    case "bar": return orderTicket(printerCfg, job, "** บาร์ **");
    case "bill": return billTicket(printerCfg, job);
    case "test": return testTicket(printerCfg, job.printer);
    default: throw new Error("unknown job type " + job.type);
  }
}

/* ---------- ส่งเข้าเครื่องพิมพ์ ---------- */
function send(ip, port, buf) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    let done = false;
    const fin = err => { if (done) return; done = true; s.destroy(); err ? reject(err) : resolve(); };
    s.setTimeout(6000, () => fin(new Error("timeout " + ip)));
    s.on("error", fin);
    s.connect(port || 9100, ip, () => s.write(buf, () => setTimeout(() => fin(), 300)));
  });
}

/* ---------- API ---------- */
async function getJobs(force) {
  const u = new URL(cfg.apiUrl);
  u.searchParams.set("action", "getPrintJobs");
  u.searchParams.set("key", cfg.agentKey);
  if (force) u.searchParams.set("force", "1");
  const r = await fetch(u, { redirect: "follow" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.message || "api error");
  return j.jobs || [];
}
async function ack(ids) {
  await fetch(cfg.apiUrl, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "ackPrintJob", key: cfg.agentKey, jobIds: ids })
  });
}

const log = (...a) => console.log(new Date().toLocaleTimeString("en-GB"), ...a);
let busy = false, tick = 0;

async function loop() {
  if (busy) return;
  busy = true;
  try {
    const jobs = await getJobs(++tick % 12 === 0);     // ทุก ~1 นาที บังคับเช็คคิวเต็ม
    const done = [];
    for (const job of jobs) {
      const pc = cfg.printers[job.printer];
      if (!pc) { log("ไม่พบการตั้งค่าเครื่องพิมพ์:", job.printer); continue; }
      try {
        const buf = buildJob(pc, job);
        for (let i = 0; i < (pc.copies || 1); i++) await send(pc.ip, pc.port, buf);
        done.push(job.jobId);
        log("พิมพ์แล้ว", job.type, "→", job.printer, pc.ip);
      } catch (e) { log("พิมพ์ไม่สำเร็จ", job.printer, pc.ip, e.message, "(จะลองใหม่)"); }
    }
    if (done.length) await ack(done);
  } catch (e) { log("ดึงคิวไม่สำเร็จ:", e.message); }
  busy = false;
}

/* พิมพ์ข้อความไทยซ้ำทุก code page เพื่อหาเบอร์ที่อ่านออก: node agent.js --scan kitchen */
async function scan(name) {
  const pc = cfg.printers[name];
  if (!pc) return log("ไม่พบเครื่องชื่อ", name, "ใน config.json");
  const nums = [];
  for (let i = 0; i <= 70; i++) nums.push(i);
  for (let i = 250; i <= 255; i++) nums.push(i);
  const t = new Ticket(pc);
  t.align(0).line("SCAN " + name + " (หาเบอร์ที่อ่านภาษาไทยออก)").rule();
  nums.forEach(n => {
    t.raw([ESC, 0x74, n]);
    t.text("cp" + String(n).padStart(3, " ") + ": ").text("ทดสอบ กุ้งเผา ผัดไทย น้ำเปล่า").raw([0x0a]);
  });
  t.raw([ESC, 0x74, 0]).rule().cut();
  await send(pc.ip, pc.port, t.buffer());
  log("ส่งหน้าสแกนไป", name, pc.ip, "— ดูว่าบรรทัดไหนอ่านออก แล้วจดเลข cp");
}

async function main() {
  const si = process.argv.indexOf("--scan");
  if (si > -1) { await scan(process.argv[si + 1] || "kitchen"); return; }
  if (process.argv.includes("--test")) {
    for (const [name, pc] of Object.entries(cfg.printers)) {
      try { await send(pc.ip, pc.port, testTicket(pc, name)); log("ส่งหน้าทดสอบ", name, pc.ip); }
      catch (e) { log("ติดต่อไม่ได้", name, pc.ip, e.message); }
    }
    return;
  }
  log("SandSea Print Agent เริ่มทำงาน");
  setInterval(loop, cfg.pollMs || 5000);
  loop();
}
main();
