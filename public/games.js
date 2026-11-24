// Cherry Spins Premium Arcade UI. Requires /arcade-server.js routes and Telegram WebApp auth.
(() => {
  const root=document.getElementById("gamesScreen");
  if(!root||root.dataset.premiumReady)return;
  root.dataset.premiumReady="1";
  const tg=window.Telegram?.WebApp;
  const headers={"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData||""};
  let balance=0,modal,content,history=[],busy=false;
  const games=[
    ["slots","🎰","CHERRY SLOTS","Слоты · Wild · каскадные барабаны","HOT"],
    ["rocket","🚀","CHERRY CRASH","Растущий множитель · риск"],
    ["cases","🎁","LUXURY CASES","Коллекционные кейсы · редкие дропы"],
    ["mines","💣","CHERRY MINES","25 клеток · множители"],
    ["pvp","⚔️","PVP WHEEL","Дуэли · живые игроки"],
    ["roulette","🎡","ROYAL ROULETTE","Колесо · 8 секторов"],
    ["plinko","🔴","NEON PLINKO","Путь шарика · x15"],
    ["minecraft","⛏️","CHERRY CRAFT","Шахта · кирки · руды"],
    ["upgrader","💎","GEM UPGRADER","Улучшение предметов"],
    ["lucky","🍀","DAILY LUCKY","Ежедневная награда"],
    ["workers","🛠️","WORKSHOP","Развитие мастерской"],
    ["giveaways","🏆","EVENTS","События и достижения"]
  ];
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function api(url,body){
    const r=await fetch(url,{method:body?"POST":"GET",headers,...(body?{body:JSON.stringify(body)}:{})});
    const j=await r.json().catch(()=>({error:"Ошибка ответа сервера"}));
    if(!r.ok)throw new Error(j.error||"Ошибка сервера");
    if(Number.isFinite(j.balance)){balance=j.balance;syncBalance();}
    return j;
  }
  function syncBalance(){
    document.querySelectorAll(".premium-balance").forEach(x=>x.textContent=balance.toLocaleString("ru-RU"));
    const old=document.querySelector(".arcade-points");if(old)old.textContent=balance.toLocaleString("ru-RU");
  }
  async function refresh(){try{const s=await api("/api/arcade/state");balance=s.balance;history=s.history||[];syncBalance()}catch(e){console.warn(e)}}
  function shell(){
    if(modal)return;
    modal=document.createElement("div");modal.className="premium-overlay";
    modal.innerHTML=`<section class="premium-modal"><button class="premium-x" aria-label="Закрыть">×</button><div class="premium-brand"><span>🍒</span><div><b>CHERRY <i>SPINS</i></b><small>ARCADE CLUB · FREE PLAY</small></div><strong>💎 <span class="premium-balance">0</span></strong></div><div class="premium-content"></div><div class="premium-foot">Виртуальные очки · без денежных ставок и вывода</div></section>`;
    document.body.append(modal);content=modal.querySelector(".premium-content");
    modal.querySelector(".premium-x").onclick=close;
    modal.addEventListener("click",e=>{if(e.target===modal)close()});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
  }
  function close(){if(modal)modal.classList.remove("visible");}
  function openView(html){shell();content.innerHTML=html;modal.classList.add("visible");syncBalance();}
  const button=(label,action,cls="")=>`<button class="lux-btn ${cls}" data-action="${action}">${label}</button>`;
  const betBox=()=>`<div class="bet-box"><label>РАЗМЕР РАУНДА</label><div class="bet-line"><button data-action="bet-min">MIN</button><input id="bet" type="number" min="1" max="10000" value="10"><button data-action="bet-half">½</button><button data-action="bet-double">2×</button><button data-action="bet-max">MAX</button></div></div>`;
  function gameHead(icon,title,sub){return `<div class="game-head"><span>${icon}</span><div><h2>${title}</h2><p>${sub}</p></div></div>`}
  function result(text,kind=""){const el=content.querySelector(".game-result");if(el){el.className="game-result show "+kind;el.textContent=text}}
  function wireBet(){const input=content.querySelector("#bet");content.querySelectorAll("[data-action^=bet-]").forEach(b=>b.onclick=()=>{let n=Math.max(1,Number(input.value)||1);if(b.dataset.action==="bet-min")n=1;if(b.dataset.action==="bet-half")n=Math.max(1,Math.floor(n/2));if(b.dataset.action==="bet-double")n=Math.min(10000,n*2);if(b.dataset.action==="bet-max")n=Math.min(10000,balance);input.value=n})}
  async function playRound(game,bet){
    if(busy)throw new Error("Подожди завершения раунда.");
    if(!Number.isSafeInteger(bet)||bet<1||bet>10000)throw new Error("Укажи ставку от 1 до 10 000.");
    busy=true;
    try{return await api("/api/arcade/round",{game,bet})}finally{busy=false}
  }
  function showHistory(){
    const rows=history.slice(0,10).map(h=>`<div class="history-row"><span>${esc(h.game.toUpperCase())}</span><span>${h.delta>0?"+":""}${h.delta}</span></div>`).join("");
    return `<div class="history-card"><b>ПОСЛЕДНИЕ РАУНДЫ</b>${rows||'<p>История появится после первой игры.</p>'}</div>`;
  }
  function openGame(id){
    refresh().finally(()=>renderGame(id));
  }
  function renderGame(id){
    const g=games.find(x=>x[0]===id);if(!g)return;
    const [_,icon,title,desc]=g;
    let html=gameHead(icon,title,desc);
    if(["slots","roulette","plinko","cases","upgrader"].includes(id)){
      html+=betBox()+`<div class="game-stage" id="stage">${id==="slots"?'<div class="slot-reels"><span>🍒</span><span>⭐</span><span>💎</span></div>':id==="roulette"?'<div class="wheel-wrap"><div class="wheel-pointer">▼</div><div class="wheel" id="wheel">🍒 · 7 · 💎 · ⭐ · 5 · 🔔 · 3 · 👑</div></div>':id==="plinko"?'<div class="plinko-board"><div class="plinko-ball">🔴</div><div class="peg-field">•　•　•　•　•<br>　•　•　•　•<br>•　•　•　•　•<br>　•　•　•　•</div><div class="plinko-bins">0.2×　0.5×　1×　2×　3×　8×　15×</div></div>':id==="cases"?'<div class="case-art">🎁</div><div class="case-choices"><button data-case="bronze">BRONZE</button><button data-case="ruby">RUBY</button><button data-case="royal">ROYAL</button></div>':'<div class="case-art">💎</div><p>Успех: 42% · выплата 2×</p>'}</div>`;
      html+=button(id==="slots"?"КРУТИТЬ БАРАБАНЫ":id==="roulette"?"ЗАПУСТИТЬ КОЛЕСО":id==="plinko"?"БРОСИТЬ ШАР":id==="cases"?"ОТКРЫТЬ КЕЙС":"УЛУЧШИТЬ","play","primary");
    } else if(id==="rocket"){
      html+=betBox()+`<div class="crash-stage"><div class="crash-rocket">🚀</div><b id="crash-x">1.00×</b><small>МНОЖИТЕЛЬ РАСТЁТ В РЕАЛЬНОМ ВРЕМЕНИ</small></div>${button("НАЧАТЬ РАУНД","crash-start","primary")} ${button("ЗАБРАТЬ ОЧКИ","crash-stop")}`;
    } else if(id==="mines"){
      html+=betBox()+`<div class="mine-options"><label>МИНЫ <select id="mine-count"><option>3</option><option>5</option><option>8</option><option>10</option></select></label><b id="mine-mult">МНОЖИТЕЛЬ 1.00×</b></div><div class="mine-grid">${Array.from({length:25},(_,i)=>`<button data-cell="${i}">?</button>`).join("")}</div>${button("НАЧАТЬ РАУНД","mine-start","primary")} ${button("ЗАБРАТЬ ОЧКИ","mine-cash")}`;
    } else if(id==="pvp"){
      html+=betBox()+`<div class="pvp-wheel-area"><div class="pvp-wheel" id="pvp-wheel">🍒　👑　💎　⭐　🍒　👑</div><div class="pvp-caption">ОДИН РАУНД · ДВА ИГРОКА · ОДИН ПОБЕДИТЕЛЬ</div></div>${button("СОЗДАТЬ КОМНАТУ","pvp-create","primary")}<div class="room-code" id="room-code"></div><div class="room-list" id="rooms"><p>Загружаем открытые дуэли…</p></div>${button("ОБНОВИТЬ СПИСОК","pvp-refresh")}`;
    } else if(id==="minecraft"){
      html+=`<div class="mine-scene"><div class="mine-rock" id="mine-rock">🪨</div><div class="ore-toast" id="ore-toast">Готов к добыче?</div></div><div class="tool-card"><span id="tool-icon">🪵</span><div><b id="tool-name">Загрузка кирки…</b><small>Прочность: <strong id="tool-dur">—</strong></small></div></div><div class="ore-inventory" id="ore-inventory"></div>${button("ДОБЫВАТЬ РУДУ","craft-mine","primary")} ${button("ПОЧИНИТЬ КИРКУ","craft-repair")}`;
    } else if(id==="lucky"){
      html+=`<div class="case-art">🍀</div><p class="muted">Ежедневная награда доступна один раз в сутки.</p>${button("ЗАБРАТЬ БОНУС","daily","primary")}`;
    } else if(id==="workers"){
      html+=`<div class="case-art">🛠️</div><p>Развивай мастерскую и собирай ресурсы в шахте.</p>${button("ОТКРЫТЬ CHERRY CRAFT","go-craft","primary")}`;
    } else {
      html+=`<div class="case-art">🏆</div><p>События, достижения и сезонные коллекции.</p><div class="history-card">События будут отображаться здесь после подключения администраторской панели.</div>`;
    }
    html+=`<div class="game-result"></div>${showHistory()}`;
    openView(html);wireBet();wireActions(id);
    if(id==="pvp")loadRooms();
    if(id==="minecraft")loadCraft();
  }
  function wireActions(id){
    const on=(a,fn)=>{const b=content.querySelector(`[data-action="${a}"]`);if(b)b.onclick=async()=>{try{await fn(b)}catch(e){result(e.message,"bad")}}};
    const bet=()=>Math.floor(Number(content.querySelector("#bet")?.value||10));
    on("play",async b=>{
      const amount=bet();b.disabled=true;
      const stage=content.querySelector("#stage");
      if(id==="slots"){stage.querySelector(".slot-reels").classList.add("spinning");await new Promise(r=>setTimeout(r,1200));}
      if(id==="roulette"){stage.querySelector("#wheel").classList.add("wheel-spin");await new Promise(r=>setTimeout(r,1700));}
      if(id==="plinko"){stage.querySelector(".plinko-ball").classList.add("ball-drop");await new Promise(r=>setTimeout(r,900));}
      const data=await playRound(id,amount);
      if(id==="slots"){stage.querySelector(".slot-reels").classList.remove("spinning");stage.querySelector(".slot-reels").innerHTML=data.result.reels.map(s=>`<span>${s}</span>`).join("");}
      if(id==="roulette"){stage.querySelector("#wheel").classList.remove("wheel-spin");stage.querySelector("#wheel").textContent=data.result.sector.label+" · "+data.result.sector.color.toUpperCase();}
      if(id==="plinko")stage.querySelector(".plinko-ball").classList.remove("ball-drop");
      if(id==="cases"){stage.querySelector(".case-art").textContent=data.result.drop.emoji;}
      if(id==="upgrader")stage.querySelector(".case-art").textContent=data.result.success?"👑":"💎";
      result(`${data.result.drop?data.result.drop.name+" · ":""}${data.result.message||data.result.combination||data.result.sector?.label||data.result.bin||""}  ${data.payout>0?"Выплата "+data.payout+" очков":"Без выплаты"} · баланс ${data.balance}`,(data.delta>0)?"good":"");
      b.disabled=false;await refresh();
    });
    on("crash-start",async b=>{
      const x=await api("/api/arcade/crash/start",{bet:bet()});let stopped=false,start=Date.now();
      b.disabled=true;let stop=content.querySelector('[data-action="crash-stop"]');stop.disabled=false;
      const ticker=setInterval(()=>{const m=Math.exp((Date.now()-start)/12000);content.querySelector("#crash-x").textContent=m.toFixed(2)+"×";if(m>20){clearInterval(ticker);stopped=true;result("Ракета улетела! Раунд проигран.","bad");stop.disabled=true;b.disabled=false;refresh()}},50);
      stop.onclick=async()=>{if(stopped)return;stopped=true;clearInterval(ticker);const d=await api("/api/arcade/crash/cashout",{id:x.id});result(d.crashed?"Не успел забрать очки. Ракета улетела.":`Забрано ${d.payout} очков на ${d.multiplier}×`,d.crashed?"bad":"good");stop.disabled=true;b.disabled=false;await refresh()};
    });
    let mineId=null,mineBet=0,mineMult=1;
    on("mine-start",async b=>{const d=await api("/api/arcade/mines/start",{bet:bet(),mines:Number(content.querySelector("#mine-count").value)});mineId=d.id;mineBet=d.bet;mineMult=1;content.querySelectorAll("[data-cell]").forEach(x=>{x.disabled=false;x.textContent="?";x.className=""});result("Раунд начался. Выбирай клетку.");b.disabled=true});
    content.querySelectorAll("[data-cell]").forEach(cell=>cell.onclick=async()=>{if(!mineId||cell.disabled)return;const d=await api("/api/arcade/mines/pick",{id:mineId,cell:Number(cell.dataset.cell)});cell.disabled=true;cell.textContent=d.hit?"💣":"🍒";cell.classList.add(d.hit?"mine-hit":"mine-safe");if(d.hit){content.querySelectorAll("[data-cell]").forEach(x=>{x.disabled=true;if(d.mines.includes(Number(x.dataset.cell)))x.textContent="💣"});mineId=null;result("Мина! Раунд завершён.","bad");await refresh()}else{mineMult=d.multiplier;content.querySelector("#mine-mult").textContent=`ВОЗМОЖНАЯ ВЫПЛАТА ${d.potential} · ${d.multiplier}×`;if(d.opened.length===25-d.mines.length){mineId=null;result("Все безопасные клетки открыты!","good");await refresh()}}});
    on("mine-cash",async()=>{if(!mineId)throw new Error("Сначала начни раунд и открой клетку.");const d=await api("/api/arcade/mines/cashout",{id:mineId});mineId=null;content.querySelectorAll("[data-cell]").forEach(x=>x.disabled=true);result(`Забрано ${d.payout} очков.`, "good");await refresh()});
    on("pvp-create",async()=>{const d=await api("/api/arcade/pvp/create",{bet:bet()});content.querySelector("#room-code").innerHTML=`<b>КОД КОМНАТЫ: ${d.room}</b><p>Ожидаем второго игрока. Не закрывай это окно.</p>`;pollRoom(d.room)});
    on("pvp-refresh",loadRooms);
    on("craft-mine",async()=>{const d=await api("/api/arcade/craft/mine",{});const rock=content.querySelector("#mine-rock");rock.classList.remove("hit");void rock.offsetWidth;rock.classList.add("hit");content.querySelector("#ore-toast").textContent=`${d.ore.emoji} ${d.ore.name} · +${d.amount} · x${d.multiplier}`;if(d.pickaxeDrop)result(`НОВАЯ КИРКА: ${d.pickaxeDrop.emoji} ${d.pickaxeDrop.name}!`,"good");await loadCraft()});
    on("craft-repair",async()=>{const d=await api("/api/arcade/craft/repair",{});result(`Кирка восстановлена за ${d.cost} очков.`,"good");await refresh();await loadCraft()});
    on("go-craft",()=>renderGame("minecraft"));
    on("daily",()=>result("Ежедневная награда будет подключена отдельным серверным заданием."));
  }
  async function loadRooms(){
    const box=content.querySelector("#rooms");if(!box)return;
    try{const d=await api("/api/arcade/pvp/rooms");box.innerHTML=d.rooms.length?d.rooms.map(r=>`<div class="room-row"><span>Комната ${esc(r.id)} · ${r.bet} очков</span><button data-join="${esc(r.id)}">ВОЙТИ</button></div>`).join(""):"<p>Пока нет открытых комнат. Создай свою дуэль.</p>";
      box.querySelectorAll("[data-join]").forEach(b=>b.onclick=async()=>{try{const x=await api("/api/arcade/pvp/join",{room:b.dataset.join});await animatePvp(x)}catch(e){result(e.message,"bad")}});
    }catch(e){box.textContent=e.message}
  }
  async function pollRoom(room){
    const box=content.querySelector("#room-code");let tries=0;
    const timer=setInterval(async()=>{if(!modal?.classList.contains("visible")||!box?.isConnected){clearInterval(timer);return}try{const d=await api(`/api/arcade/pvp/${room}`);if(d.status==="finished"){clearInterval(timer);await animatePvp(d)}}catch(e){clearInterval(timer);result(e.message,"bad")}if(++tries>180)clearInterval(timer)},2000);
  }
  async function animatePvp(d){
    const wheel=content.querySelector("#pvp-wheel");if(wheel){wheel.classList.remove("wheel-spin");void wheel.offsetWidth;wheel.classList.add("wheel-spin");await new Promise(r=>setTimeout(r,2600))}
    const won=d.winnerId===String(tg?.initDataUnsafe?.user?.id||"");
    result(won?"ПОБЕДА! Ты выиграл дуэль и получил банк.":"Раунд завершён. Победитель определён сервером.",won?"good":"bad");
    await refresh();loadRooms();
  }
  async function loadCraft(){
    try{const d=await api("/api/arcade/craft");const tools={wood:"🪵",stone:"🪨",iron:"⚒️",gold:"✨",diamond:"💎",ruby:"🔱"};
      content.querySelector("#tool-icon").textContent=tools[d.pickaxe]||"⛏️";
      content.querySelector("#tool-name").textContent=d.pickaxeInfo.name;
      content.querySelector("#tool-dur").textContent=d.durability+"/"+d.pickaxeInfo.max;
      const labels={coal:"Уголь",copper:"Медь",iron:"Железо",gold:"Золото",emerald:"Изумруд",diamond:"Алмаз",ruby:"Рубин"};
      content.querySelector("#ore-inventory").innerHTML=Object.entries(d.ores).map(([k,v])=>`<span>${labels[k]||k}: <b>${v}</b></span>`).join("")||"<span>Руда пока не добыта</span>";
    }catch(e){result(e.message,"bad")}
  }
  function renderHub(){
    root.innerHTML=`<div class="premium-hub"><div class="hub-hero"><div class="hero-glow"></div><div class="hero-copy"><small>WELCOME TO THE CLUB</small><h1>CHERRY <em>SPINS</em></h1><p>Твоя игровая вселенная начинается здесь.</p><div class="hero-balance">💎 <b class="premium-balance">${balance.toLocaleString("ru-RU")}</b><span>ВИРТУАЛЬНЫХ ОЧКОВ</span></div></div><div class="hero-cherry">🍒</div></div><div class="hub-section"><div><small>CHOOSE YOUR GAME</small><h2>Игровой зал</h2></div><span class="live-pill">● ARCADE</span></div><div class="premium-game-grid">${games.map((g,i)=>`<button class="premium-game-card card-${g[0]}" data-game="${g[0]}" style="--delay:${i*45}ms"><span class="game-tag">${g[4]||"PLAY"}</span><span class="card-emoji">${g[1]}</span><b>${g[2]}</b><small>${g[3]}</small><i>ИГРАТЬ　↗</i></button>`).join("")}</div><div class="hub-disclaimer">FREE PLAY · ВИРТУАЛЬНЫЕ ОЧКИ НЕ ИМЕЮТ ДЕНЕЖНОЙ СТОИМОСТИ</div></div>`;
    root.querySelectorAll("[data-game]").forEach(b=>b.addEventListener("click",()=>openGame(b.dataset.game)));
  }
  refresh().finally(renderHub);
})();