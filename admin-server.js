// Cherry Spins admin routes.
// Register before the SPA fallback: registerAdminRoutes({ app, db, auth });
const ADMIN_TELEGRAM_ID = "5561285502";

export function registerAdminRoutes({ app, db, auth }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_balance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('credit','debit')),
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  const isAdmin = (req, res, next) => {
    if (!req.user || String(req.user.id) !== ADMIN_TELEGRAM_ID) {
      return res.status(403).json({ error: "Доступ запрещён. Эта панель доступна только администратору." });
    }
    next();
  };
  const getUser = id => db.prepare(
    "SELECT id,username,first_name,balance FROM users WHERE id=?"
  ).get(String(id));

  app.get("/admin", (req, res) => {
    res.sendFile("admin.html", { root: "public" });
  });

  app.get("/api/admin/overview", auth, isAdmin, (req, res) => {
    const players = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const totalIssued = db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS n FROM admin_balance_log WHERE action='credit'"
    ).get().n;
    const history = db.prepare(`
      SELECT l.id,l.user_id,l.action,l.amount,l.balance_after,l.created_at,
             COALESCE(NULLIF(u.first_name,''),NULLIF(u.username,''),u.id) AS player_name
      FROM admin_balance_log l LEFT JOIN users u ON u.id=l.user_id
      ORDER BY l.id DESC LIMIT 30
    `).all();
    res.json({ players, total_issued: totalIssued, history });
  });

  app.get("/api/admin/player/:id", auth, isAdmin, (req, res) => {
    const id = String(req.params.id || "");
    if (!/^\d{1,24}$/.test(id)) return res.status(400).json({ error: "Некорректный Telegram ID." });
    const user = getUser(id);
    if (!user) return res.status(404).json({ error: "Игрок не найден. Он должен хотя бы один раз открыть Mini App." });
    res.json(user);
  });

  app.post("/api/admin/balance", auth, isAdmin, (req, res) => {
    const userId = String(req.body?.userId || "");
    const amount = Number(req.body?.amount);
    const action = String(req.body?.action || "");
    if (!/^\d{1,24}$/.test(userId)) return res.status(400).json({ error: "Некорректный Telegram ID." });
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000000)
      return res.status(400).json({ error: "Количество должно быть целым числом от 1 до 100 000 000." });
    if (!["credit","debit"].includes(action)) return res.status(400).json({ error: "Неизвестная операция." });

    const tx = db.transaction(() => {
      const user = getUser(userId);
      if (!user) throw new Error("Игрок не найден.");
      if (action === "debit" && user.balance < amount) throw new Error("У игрока недостаточно очков.");
      const delta = action === "credit" ? amount : -amount;
      db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(delta, userId);
      const updated = getUser(userId);
      db.prepare(`INSERT INTO admin_balance_log
        (admin_id,user_id,action,amount,balance_after,created_at) VALUES(?,?,?,?,?,?)`)
        .run(String(req.user.id), userId, action, amount, updated.balance, Math.floor(Date.now()/1000));
      return updated;
    });
    try {
      res.json(tx());
    } catch (error) {
      res.status(400).json({ error: error.message || "Не удалось изменить баланс." });
    }
  });
}
