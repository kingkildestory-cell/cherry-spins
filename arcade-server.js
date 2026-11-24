// Cherry Spins premium arcade API extension.
// Add to server.js: import { registerArcadeRoutes } from "./arcade-server.js";
// Then, BEFORE app.get("*", ...), call:
// registerArcadeRoutes({ app, db, auth, ensureUser, now });
import crypto from "node:crypto";

export function registerArcadeRoutes({ app, db, auth, ensureUser, now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arcade_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL, game TEXT NOT NULL, bet INTEGER NOT NULL,
      result TEXT NOT NULL, delta INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS arcade_pvp (
      id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, opponent_id TEXT,
      bet INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'waiting',
      winner_id TEXT, wheel_index INTEGER, created_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS arcade_mines (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, bet INTEGER NOT NULL,
      mines TEXT NOT NULL, opened TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS arcade_craft (
      user_id TEXT PRIMARY KEY, pickaxe TEXT NOT NULL DEFAULT 'wood',
      durability INTEGER NOT NULL DEFAULT 20, level INTEGER NOT NULL DEFAULT 1,
      ores TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
    );
  `);

  const rand = n => crypto.randomInt(0, n);
  const userRow = id => db.prepare("SELECT id,balance FROM users WHERE id=?").get(id);
  const craftRow = id => {
    db.prepare("INSERT OR IGNORE INTO arcade_craft(user_id,updated_at) VALUES(?,?)").run(id, now());
    return db.prepare("SELECT * FROM arcade_craft WHERE user_id=?").get(id);
  };
  const addRound = (id, game, bet, result, delta) =>
    db.prepare("INSERT INTO arcade_rounds(user_id,game,bet,result,delta,created_at) VALUES(?,?,?,?,?,?)")
      .run(id, game, bet, JSON.stringify(result), delta, now());
  const updateBalance = (id, delta) =>
    db.prepare("UPDATE users SET balance=MAX(0,balance+?) WHERE id=?").run(delta, id);
  const recent = id => db.prepare(
    "SELECT id,game,bet,result,delta,created_at FROM arcade_rounds WHERE user_id=? ORDER BY id DESC LIMIT 20"
  ).all(id).map(x => ({...x, result: JSON.parse(x.result)}));

  app.get("/api/arcade/state", auth, (req,res) => {
    ensureUser(req.user);
    const u = userRow(req.user.id);
    res.json({ balance:u.balance, history:recent(req.user.id) });
  });

  // Server-side outcome generation for one-shot arcade games.
  app.post("/api/arcade/round", auth, (req,res) => {
    ensureUser(req.user);
    const id = req.user.id;
    const game = String(req.body?.game || "");
    const bet = Number(req.body?.bet);
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > 10000)
      return res.status(400).json({error:"Ставка должна быть от 1 до 10 000 очков."});
    const allowed = ["slots","roulette","plinko","cases","upgrader"];
    if (!allowed.includes(game)) return res.status(400).json({error:"Неизвестная игра."});
    const u = userRow(id);
    if (!u || u.balance < bet) return res.status(409).json({error:"Недостаточно очков."});

    let result = {}, payout = 0;
    if (game === "slots") {
      const symbols = ["🍒","🍋","🔔","⭐","💎","7️⃣","🃏"];
      const weights = [30,25,18,13,8,4,2];
      const pick = () => {
        let n = rand(weights.reduce((a,b)=>a+b,0));
        for (let i=0;i<weights.length;i++){ n-=weights[i]; if(n<0)return symbols[i]; }
        return symbols[0];
      };
      const reels = [pick(),pick(),pick()];
      const counts = reels.reduce((o,s)=>(o[s]=(o[s]||0)+1,o),{});
      const triple = Object.entries(counts).find(([,n])=>n===3)?.[0];
      const pair = Object.entries(counts).find(([,n])=>n===2)?.[0];
      const multipliers = {"🍒":3,"🍋":2,"🔔":4,"⭐":6,"💎":12,"7️⃣":30,"🃏":8};
      if (triple) payout = bet * (multipliers[triple] || 3);
      else if (pair) payout = Math.floor(bet * 1.25);
      result = { reels, combination: triple ? "triple" : pair ? "pair" : "miss",
        multiplier: payout ? Number((payout/bet).toFixed(2)) : 0,
        paytable: {"3 🍒":"3x","3 🍋":"2x","3 🔔":"4x","3 ⭐":"6x","3 💎":"12x","3 7️⃣":"30x","пара":"1.25x"} };
    } else if (game === "roulette") {
      const sectors = [
        {label:"0",mult:0,color:"green"},{label:"1",mult:2,color:"red"},
        {label:"2",mult:0,color:"black"},{label:"3",mult:3,color:"red"},
        {label:"4",mult:0,color:"black"},{label:"5",mult:5,color:"red"},
        {label:"6",mult:0,color:"black"},{label:"7",mult:10,color:"gold"}
      ];
      const sector = sectors[rand(sectors.length)];
      payout = bet * sector.mult;
      result = {sector, sectors, multiplier:sector.mult};
    } else if (game === "plinko") {
      const bins = [
        {x:"0.2x",m:.2,w:10},{x:"0.5x",m:.5,w:18},{x:"1x",m:1,w:28},
        {x:"2x",m:2,w:20},{x:"3x",m:3,w:14},{x:"8x",m:8,w:8},{x:"15x",m:15,w:2}
      ];
      let n=rand(bins.reduce((s,b)=>s+b.w,0)), bin=bins[0];
      for(const b of bins){n-=b.w;if(n<0){bin=b;break;}}
      payout=Math.floor(bet*bin.m);
      result={bin:bin.x,multiplier:bin.m};
    } else if (game === "cases") {
      const drops=[
        {name:"Вишнёвый жетон",emoji:"🍒",m:.5,weight:24,rarity:"Обычный"},
        {name:"Рубиновый осколок",emoji:"♦️",m:1,weight:28,rarity:"Обычный"},
        {name:"Золотой слиток",emoji:"🪙",m:1.5,weight:22,rarity:"Редкий"},
        {name:"Корона",emoji:"👑",m:3,weight:16,rarity:"Эпический"},
        {name:"Алмазная вишня",emoji:"💎",m:8,weight:8,rarity:"Легендарный"},
        {name:"Джекпот",emoji:"🍒",m:20,weight:2,rarity:"Мифический"}
      ];
      let n=rand(100), drop=drops[0];
      for(const d of drops){n-=d.weight;if(n<0){drop=d;break;}}
      payout=Math.floor(bet*drop.m);
      result={drop,multiplier:drop.m};
    } else if (game === "upgrader") {
      const success = rand(100)<42;
      payout = success ? bet*2 : 0;
      result={success,multiplier:success?2:0,message:success?"Улучшение успешно":"Попытка не удалась"};
    }

    const delta = payout - bet;
    db.transaction(()=>{
      updateBalance(id, delta);
      addRound(id,game,bet,result,delta);
    })();
    res.json({game,bet,payout,delta,result,balance:userRow(id).balance,history:recent(id)});
  });

  // Mines: board and every pick are controlled by the server.
  app.post("/api/arcade/mines/start", auth, (req,res)=>{
    ensureUser(req.user);
    const bet=Number(req.body?.bet), count=Number(req.body?.mines||3), id=req.user.id;
    if(!Number.isSafeInteger(bet)||bet<1||bet>10000||!Number.isInteger(count)||count<1||count>10)
      return res.status(400).json({error:"Проверь ставку и количество мин."});
    const u=userRow(id); if(u.balance<bet)return res.status(409).json({error:"Недостаточно очков."});
    const cells=new Set(); while(cells.size<count)cells.add(rand(25));
    const gameId=crypto.randomUUID();
    db.transaction(()=>{
      updateBalance(id,-bet);
      db.prepare("INSERT INTO arcade_mines(id,user_id,bet,mines,opened,created_at) VALUES(?,?,?,?,?,?)")
        .run(gameId,id,bet,JSON.stringify([...cells]),"[]",now());
    })();
    res.json({id:gameId,bet,mines:count,balance:userRow(id).balance,opened:[]});
  });
  app.post("/api/arcade/mines/pick", auth, (req,res)=>{
    const game=db.prepare("SELECT * FROM arcade_mines WHERE id=? AND user_id=?").get(String(req.body?.id||""),req.user.id);
    if(!game||game.status!=="active")return res.status(404).json({error:"Раунд не найден или завершён."});
    const cell=Number(req.body?.cell);
    if(!Number.isInteger(cell)||cell<0||cell>24)return res.status(400).json({error:"Некорректная клетка."});
    const opened=JSON.parse(game.opened), mines=JSON.parse(game.mines);
    if(opened.includes(cell))return res.status(409).json({error:"Клетка уже открыта."});
    opened.push(cell);
    if(mines.includes(cell)){
      db.prepare("UPDATE arcade_mines SET opened=?,status='lost' WHERE id=?").run(JSON.stringify(opened),game.id);
      addRound(req.user.id,"mines",game.bet,{hit:true,cell},-game.bet);
      return res.json({hit:true,cell,mines,opened,balance:userRow(req.user.id).balance,payout:0});
    }
    db.prepare("UPDATE arcade_mines SET opened=? WHERE id=?").run(JSON.stringify(opened),game.id);
    const safe=opened.length, mineCount=mines.length;
    const multiplier=Number((Array.from({length:safe},(_,i)=>(25-mineCount-i)/(25-i)).reduce((a,b)=>a/b,1)*0.94).toFixed(2));
    res.json({hit:false,cell,opened,multiplier,potential:Math.floor(game.bet*multiplier),balance:userRow(req.user.id).balance});
  });
  app.post("/api/arcade/mines/cashout", auth, (req,res)=>{
    const game=db.prepare("SELECT * FROM arcade_mines WHERE id=? AND user_id=?").get(String(req.body?.id||""),req.user.id);
    if(!game||game.status!=="active")return res.status(404).json({error:"Раунд уже завершён."});
    const opened=JSON.parse(game.opened), mines=JSON.parse(game.mines);
    if(!opened.length)return res.status(409).json({error:"Сначала открой безопасную клетку."});
    const survival=Array.from({length:opened.length},(_,i)=>(25-mines.length-i)/(25-i)).reduce((a,b)=>a*b,1);
    const multiplier=.94/survival;
    const payout=Math.floor(game.bet*multiplier);
    db.transaction(()=>{
      db.prepare("UPDATE arcade_mines SET status='cashed' WHERE id=?").run(game.id);
      updateBalance(req.user.id,payout);
      addRound(req.user.id,"mines",game.bet,{opened:opened.length,multiplier:Number((payout/game.bet).toFixed(2)),payout},payout-game.bet);
    })();
    res.json({payout,delta:payout-game.bet,balance:userRow(req.user.id).balance,mines});
  });

  // Crash: server stores crash point and validates elapsed time on cash-out.
  db.exec(`CREATE TABLE IF NOT EXISTS arcade_crash (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,bet INTEGER NOT NULL,
    started_ms INTEGER NOT NULL,crash_at REAL NOT NULL,status TEXT NOT NULL DEFAULT 'active'
  )`);
  app.post("/api/arcade/crash/start",auth,(req,res)=>{
    ensureUser(req.user);
    const bet=Number(req.body?.bet),u=userRow(req.user.id);
    if(!Number.isSafeInteger(bet)||bet<1||bet>10000)return res.status(400).json({error:"Некорректная ставка."});
    if(u.balance<bet)return res.status(409).json({error:"Недостаточно очков."});
    const p=crypto.randomBytes(4).readUInt32BE(0)/0x100000000;
    const crashAt=Number(Math.max(1,Math.min(30,1/(1-p*.965))).toFixed(2));
    const id=crypto.randomUUID(),started=Date.now();
    db.transaction(()=>{updateBalance(req.user.id,-bet);db.prepare("INSERT INTO arcade_crash(id,user_id,bet,started_ms,crash_at) VALUES(?,?,?,?,?)").run(id,req.user.id,bet,started,crashAt)})();
    res.json({id,bet,started,balance:userRow(req.user.id).balance});
  });
  app.post("/api/arcade/crash/cashout",auth,(req,res)=>{
    const g=db.prepare("SELECT * FROM arcade_crash WHERE id=? AND user_id=?").get(String(req.body?.id||""),req.user.id);
    if(!g||g.status!=="active")return res.status(404).json({error:"Раунд завершён."});
    const elapsed=Math.max(0,Date.now()-g.started_ms);
    const multiplier=Number(Math.exp(elapsed/12000).toFixed(2));
    if(multiplier>=g.crash_at){
      db.prepare("UPDATE arcade_crash SET status='crashed' WHERE id=?").run(g.id);
      addRound(req.user.id,"crash",g.bet,{crashedAt:g.crash_at},-g.bet);
      return res.json({crashed:true,crashAt:g.crash_at,balance:userRow(req.user.id).balance});
    }
    const payout=Math.floor(g.bet*multiplier);
    db.transaction(()=>{db.prepare("UPDATE arcade_crash SET status='cashed' WHERE id=?").run(g.id);updateBalance(req.user.id,payout);addRound(req.user.id,"crash",g.bet,{multiplier,payout},payout-g.bet)})();
    res.json({crashed:false,multiplier,payout,balance:userRow(req.user.id).balance});
  });

  // Real two-player wheel. Stakes are reserved on join; result is one server-side sector.
  app.post("/api/arcade/pvp/create",auth,(req,res)=>{
    ensureUser(req.user);
    const bet=Number(req.body?.bet),u=userRow(req.user.id);
    if(!Number.isSafeInteger(bet)||bet<1||bet>10000)return res.status(400).json({error:"Ставка от 1 до 10 000 очков."});
    if(u.balance<bet)return res.status(409).json({error:"Недостаточно очков."});
    const id=crypto.randomBytes(4).toString("hex").toUpperCase();
    db.transaction(()=>{updateBalance(req.user.id,-bet);db.prepare("INSERT INTO arcade_pvp(id,creator_id,bet,status,created_at) VALUES(?,?,?,'waiting',?)").run(id,req.user.id,bet,now())})();
    res.json({room:id,bet,balance:userRow(req.user.id).balance,status:"waiting"});
  });
  app.get("/api/arcade/pvp/rooms",auth,(req,res)=>{
    const rooms=db.prepare(`SELECT p.id,p.bet,p.created_at,u.first_name AS host
      FROM arcade_pvp p JOIN users u ON u.id=p.creator_id
      WHERE p.status='waiting' AND p.creator_id<>? ORDER BY p.created_at DESC LIMIT 20`).all(req.user.id);
    res.json({rooms});
  });
  app.post("/api/arcade/pvp/join",auth,(req,res)=>{
    ensureUser(req.user);
    const room=String(req.body?.room||"").toUpperCase();
    const g=db.prepare("SELECT * FROM arcade_pvp WHERE id=? AND status='waiting'").get(room);
    if(!g)return res.status(404).json({error:"Комната уже занята или не найдена."});
    if(g.creator_id===req.user.id)return res.status(400).json({error:"Нельзя войти в собственную комнату."});
    const u=userRow(req.user.id);if(u.balance<g.bet)return res.status(409).json({error:"Недостаточно очков."});
    const wheelIndex=rand(2),winner=wheelIndex===0?g.creator_id:req.user.id;
    try {
      db.transaction(()=>{
        const changed=db.prepare("UPDATE arcade_pvp SET opponent_id=?,status='finished',winner_id=?,wheel_index=?,finished_at=? WHERE id=? AND status='waiting'")
          .run(req.user.id,winner,wheelIndex,now(),room);
        if(changed.changes!==1) throw new Error("Комната уже занята другим игроком.");
        const fresh=userRow(req.user.id);
        if(!fresh || fresh.balance<g.bet) throw new Error("Недостаточно очков.");
        updateBalance(req.user.id,-g.bet);
        updateBalance(winner,g.bet*2);
      })();
    } catch (e) {
      return res.status(409).json({error:e.message||"Не удалось присоединиться к комнате."});
    }
    const updated=db.prepare("SELECT * FROM arcade_pvp WHERE id=?").get(room);
    res.json({room:updated.id,status:updated.status,bet:updated.bet,winnerId:updated.winner_id,
      wheelIndex:updated.wheel_index,creatorId:updated.creator_id,opponentId:updated.opponent_id,
      balance:userRow(req.user.id).balance});
  });
  app.get("/api/arcade/pvp/:room",auth,(req,res)=>{
    const g=db.prepare("SELECT * FROM arcade_pvp WHERE id=?").get(String(req.params.room).toUpperCase());
    if(!g||![g.creator_id,g.opponent_id].includes(req.user.id))return res.status(404).json({error:"Комната не найдена."});
    res.json({room:g.id,status:g.status,bet:g.bet,winnerId:g.winner_id,wheelIndex:g.wheel_index,
      creatorId:g.creator_id,opponentId:g.opponent_id});
  });

  // Persistent Minecraft-style mining and randomized pickaxe drops.
  const pickaxes={
    wood:{name:"Деревянная кирка",emoji:"🪵",power:1,max:20},
    stone:{name:"Каменная кирка",emoji:"⛏️",power:1.25,max:35},
    iron:{name:"Железная кирка",emoji:"⚒️",power:1.7,max:55},
    gold:{name:"Золотая кирка",emoji:"✨",power:2.2,max:40},
    diamond:{name:"Алмазная кирка",emoji:"💎",power:3,max:90},
    ruby:{name:"Рубиновая кирка",emoji:"🔱",power:4,max:120}
  };
  const oreTable=[
    {key:"coal",name:"Уголь",emoji:"⚫",weight:36,base:2},
    {key:"copper",name:"Медь",emoji:"🟠",weight:25,base:4},
    {key:"iron",name:"Железо",emoji:"🩶",weight:18,base:7},
    {key:"gold",name:"Золото",emoji:"🟡",weight:11,base:12},
    {key:"emerald",name:"Изумруд",emoji:"🟢",weight:6,base:22},
    {key:"diamond",name:"Алмаз",emoji:"💎",weight:3,base:45},
    {key:"ruby",name:"Рубин",emoji:"♦️",weight:1,base:100}
  ];
  app.get("/api/arcade/craft",auth,(req,res)=>{
    ensureUser(req.user);const c=craftRow(req.user.id);
    res.json({...c,ores:JSON.parse(c.ores),pickaxeInfo:pickaxes[c.pickaxe]});
  });
  app.post("/api/arcade/craft/mine",auth,(req,res)=>{
    ensureUser(req.user);const c=craftRow(req.user.id),tool=pickaxes[c.pickaxe]||pickaxes.wood;
    if(c.durability<=0)return res.status(409).json({error:"Кирка сломалась. Почини её перед добычей."});
    let n=rand(100),ore=oreTable[0];for(const o of oreTable){n-=o.weight;if(n<0){ore=o;break;}}
    const multOptions=[1,1.2,1.5,2,3,5],mult=multOptions[rand(multOptions.length)];
    const amount=Math.max(1,Math.floor(ore.base*tool.power*mult));
    const ores=JSON.parse(c.ores);ores[ore.key]=(ores[ore.key]||0)+1;
    const dropRoll=rand(1000),dropChance={wood:0,stone:8,iron:16,gold:12,emerald:5,diamond:7,ruby:3,coal:1,copper:2};
    let pickaxeDrop=null;
    if(dropRoll<dropChance[ore.key]*10){
      const possible=ore.key==="ruby"?["ruby","diamond"]:ore.key==="diamond"?["diamond","gold","iron"]:ore.key==="emerald"?["gold","iron","stone"]:["iron","stone"];
      const key=possible[rand(possible.length)];pickaxeDrop={key,...pickaxes[key]};
      db.prepare("UPDATE arcade_craft SET pickaxe=?,durability=?,ores=?,updated_at=? WHERE user_id=?")
        .run(key,pickaxes[key].max,JSON.stringify(ores),now(),req.user.id);
    } else {
      db.prepare("UPDATE arcade_craft SET durability=durability-1,ores=?,updated_at=? WHERE user_id=?")
        .run(JSON.stringify(ores),now(),req.user.id);
    }
    res.json({ore,amount,multiplier:mult,pickaxeDrop,craft:{
      pickaxe:pickaxeDrop?.key||c.pickaxe,durability:pickaxeDrop?pickaxes[pickaxeDrop.key].max:c.durability-1,
      level:c.level,ores
    }});
  });
  app.post("/api/arcade/craft/repair",auth,(req,res)=>{
    ensureUser(req.user);const c=craftRow(req.user.id),tool=pickaxes[c.pickaxe]||pickaxes.wood;
    const cost=Math.max(5,Math.ceil((tool.max-c.durability)*2));
    const u=userRow(req.user.id);if(u.balance<cost)return res.status(409).json({error:`Для ремонта нужно ${cost} очков.`});
    db.transaction(()=>{updateBalance(req.user.id,-cost);db.prepare("UPDATE arcade_craft SET durability=?,updated_at=? WHERE user_id=?").run(tool.max,now(),req.user.id)})();
    res.json({cost,balance:userRow(req.user.id).balance,durability:tool.max});
  });
  app.get("/api/arcade/history",auth,(req,res)=>res.json({history:recent(req.user.id)}));
}
