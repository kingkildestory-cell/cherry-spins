import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { registerArcadeRoutes } from "./arcade-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const BOT_USERNAME = process.env.BOT_USERNAME || "your_bot_username";
const DEV_AUTH = process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production";

fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
const db = new Database(path.join(__dirname, "data", "game.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT, first_name TEXT,
  balance INTEGER NOT NULL DEFAULT 0, spins INTEGER NOT NULL DEFAULT 0,
  last_free_spin INTEGER NOT NULL DEFAULT 0, referrer_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  item_key TEXT NOT NULL, item_name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_claims (
  user_id TEXT NOT NULL, task_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, task_id)
);
CREATE TABLE IF NOT EXISTS referrals (
  inviter_id TEXT NOT NULL, invitee_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY(inviter_id, invitee_id)
);
CREATE TABLE IF NOT EXISTS spins_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  item_key TEXT NOT NULL, item_name TEXT NOT NULL, created_at INTEGER NOT NULL
);
`);

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const now = () => Math.floor(Date.now() / 1000);
const prizes = [
  { key:"rose", name:"Роза", weight:22, emoji:"🌹", rarity:"common" },
  { key:"cherry", name:"Вишня", weight:22, emoji:"🍒", rarity:"common" },
  { key:"heart", name:"Сердце", weight:16, emoji:"💗", rarity:"common" },
  { key:"teddy", name:"Мишка", weight:12, emoji:"🧸", rarity:"rare" },
  { key:"gift", name:"Подарок", weight:10, emoji:"🎁", rarity:"rare" },
  { key:"cake", name:"Торт", weight:8, emoji:"🎂", rarity:"rare" },
  { key:"bottle", name:"Бутылка", weight:5, emoji:"🍾", rarity:"epic" },
  { key:"ring", name:"Кольцо", weight:3, emoji:"💍", rarity:"epic" },
  { key:"diamond", name:"Алмаз", weight:2, emoji:"💎", rarity:"legendary" }
];
const tasks = [
  { id:"subscribe", title:"Подписаться на канал", reward:1, description:"Подпишись на наш Telegram-канал", type:"channel" },
  { id:"news", title:"Следить за новостями", reward:1, description:"Не пропускай новости и обновления", type:"channel" }
];

function verifyTelegram(initData) {
  if (!BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || now() - authDate > 86400) return null;
  const dataCheckString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(hash, "hex"))) return null;
  try { return JSON.parse(params.get("user") || "null"); } catch { return null; }
}

function auth(req, res, next) {
  const initData = req.get("X-Telegram-Init-Data") || "";
  const tgUser = verifyTelegram(initData);
  if (tgUser?.id) {
    req.user = { id:String(tgUser.id), username:tgUser.username || "", first_name:tgUser.first_name || "Игрок" };
    return next();
  }
  if (DEV_AUTH) {
    req.user = { id:"local-demo-user", username:"demo_player", first_name:"Игрок" };
    return next();
  }
  return res.status(401).json({ error:"Открой приложение через Telegram." });
}

function ensureUser(user, startParam = "") {
  const existing = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  if (!existing) {
    const referrer = startParam.startsWith("ref_") ? startParam.slice(4) : null;
    db.prepare(`INSERT INTO users(id,username,first_name,referrer_id,created_at)
      VALUES(?,?,?,?,?)`).run(user.id,user.username,user.first_name,
      referrer && referrer !== user.id ? referrer : null,now());
    if (referrer && referrer !== user.id && db.prepare("SELECT id FROM users WHERE id=?").get(referrer)) {
      db.prepare("INSERT OR IGNORE INTO referrals(inviter_id,invitee_id,created_at) VALUES(?,?,?)")
        .run(referrer,user.id,now());
    }
  } else {
    db.prepare("UPDATE users SET username=?,first_name=? WHERE id=?")
      .run(user.username,user.first_name,user.id);
  }
  return db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
}
function profile(id) {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  const inventory = db.prepare("SELECT item_key,item_name,COUNT(*) as quantity FROM inventory WHERE user_id=? GROUP BY item_key,item_name ORDER BY MAX(created_at) DESC").all(id);
  const referrals = db.prepare("SELECT COUNT(*) as n FROM referrals WHERE inviter_id=?").get(id).n;
  const claims = db.prepare("SELECT task_id FROM task_claims WHERE user_id=?").all(id).map(x=>x.task_id);
  return { id:u.id, username:u.username, firstName:u.first_name, balance:u.balance,
    spins:u.spins, lastFreeSpin:u.last_free_spin, inventory, referrals, claims,
    nextFreeAt:u.last_free_spin ? u.last_free_spin + 86400 : 0 };
}
function weightedPrize() {
  const total = prizes.reduce((s,p)=>s+p.weight,0);
  let n = crypto.randomInt(1,total+1);
  for (const p of prizes) { n -= p.weight; if (n <= 0) return p; }
  return prizes[0];
}
app.get("/api/config", (_req,res) => res.json({ botUsername:BOT_USERNAME, tasks, prizes:prizes.map(({key,name,emoji,rarity})=>({key,name,emoji,rarity})) }));
app.get("/api/me", auth, (req,res) => {
  const start = String(req.query.startapp || "");
  ensureUser(req.user,start);
  const u = db.prepare("SELECT spins,last_free_spin FROM users WHERE id=?").get(req.user.id);
  if (!u.last_free_spin || now() >= u.last_free_spin + 86400) {
    db.prepare("UPDATE users SET spins=spins+1,last_free_spin=? WHERE id=?").run(now(),req.user.id);
  }
  res.json(profile(req.user.id));
});
app.post("/api/spin", auth, (req,res) => {
  ensureUser(req.user);
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (user.spins < 1) return res.status(409).json({error:"Бесплатные прокрутки закончились."});
  const prize = weightedPrize();
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET spins=spins-1 WHERE id=?").run(req.user.id);
    db.prepare("INSERT INTO inventory(user_id,item_key,item_name,created_at) VALUES(?,?,?,?)")
      .run(req.user.id,prize.key,prize.name,now());
    db.prepare("INSERT INTO spins_log(user_id,item_key,item_name,created_at) VALUES(?,?,?,?)")
      .run(req.user.id,prize.key,prize.name,now());
  });
  tx();
  res.json({ prize, profile:profile(req.user.id) });
});
app.post("/api/claim-task", auth, async (req,res) => {
  ensureUser(req.user);
  const task = tasks.find(t=>t.id===req.body?.taskId);
  if (!task) return res.status(404).json({error:"Задание не найдено."});
  if (db.prepare("SELECT 1 FROM task_claims WHERE user_id=? AND task_id=?").get(req.user.id,task.id))
    return res.status(409).json({error:"Награда уже получена."});
  // For a real channel task, set CHANNEL_ID and BOT_TOKEN; the bot must be an admin.
  if (task.type === "channel" && process.env.CHANNEL_ID && BOT_TOKEN) {
    const tg = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(process.env.CHANNEL_ID)}&user_id=${encodeURIComponent(req.user.id)}`);
    const data = await tg.json();
    if (!data.ok || !["member","administrator","creator"].includes(data.result?.status))
      return res.status(403).json({error:"Сначала подпишись на канал."});
  } else if (process.env.NODE_ENV === "production") {
    return res.status(503).json({error:"Проверка задания ещё не настроена администратором."});
  }
  db.transaction(()=>{
    db.prepare("INSERT INTO task_claims(user_id,task_id,created_at) VALUES(?,?,?)").run(req.user.id,task.id,now());
    db.prepare("UPDATE users SET spins=spins+? WHERE id=?").run(task.reward,req.user.id);
  })();
  res.json({profile:profile(req.user.id)});
});
app.get("/api/referral", auth, (req,res) => {
  ensureUser(req.user);
  const code = `ref_${req.user.id}`;
  res.json({ code, link:`https://t.me/${BOT_USERNAME}?startapp=${code}`, count:profile(req.user.id).referrals });
});
app.get("/api/leaderboard", (_req,res) => {
  res.json(db.prepare(`SELECT first_name as name, COUNT(r.invitee_id) as referrals
    FROM users u LEFT JOIN referrals r ON r.inviter_id=u.id
    GROUP BY u.id ORDER BY referrals DESC LIMIT 10`).all());
});
app.get("/api/admin/stats", (req,res) => {
  if (!process.env.ADMIN_TOKEN || req.get("X-Admin-Token") !== process.env.ADMIN_TOKEN)
    return res.status(403).json({error:"Forbidden"});
  res.json({
    users:db.prepare("SELECT COUNT(*) n FROM users").get().n,
    spins:db.prepare("SELECT COUNT(*) n FROM spins_log").get().n,
    claims:db.prepare("SELECT COUNT(*) n FROM task_claims").get().n
  });
});
registerArcadeRoutes({ app, db, auth, ensureUser, now });
app.get("*", (_req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`Cherry Spins running on http://localhost:${PORT}`));
