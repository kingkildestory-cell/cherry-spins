const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const initData = tg?.initData || "";
const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get("startapp") || "";
const state = { profile:null, config:null, referral:null, spinning:false, rotation:0 };
const $ = (id)=>document.getElementById(id);
const headers = {"Content-Type":"application/json","X-Telegram-Init-Data":initData};
async function api(url, options={}) {
  const res = await fetch(url,{...options,headers:{...headers,...options.headers}});
  const data = await res.json().catch(()=>({error:"Ошибка сервера"}));
  if(!res.ok) throw new Error(data.error || "Что-то пошло не так");
  return data;
}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400)}
function emojiFor(key){return ({rose:"🌹",cherry:"🍒",heart:"💗",teddy:"🧸",gift:"🎁",cake:"🎂",bottle:"🍾",ring:"💍",diamond:"💎"})[key]||"🎁"}
function renderWheel(){
  const list=state.config.prizes;
  $("wheelSegments").innerHTML=list.map((p,i)=>{
    const angle=(360/list.length)*i+360/list.length/2;
    return `<span class="segment-emoji" style="transform:translate(-50%,-50%) rotate(${angle}deg) translateY(-${Math.round(118)}px) rotate(-${angle}deg)">${p.emoji}</span>`;
  }).join("");
  $("prizeStrip").innerHTML=list.map(p=>`<div class="prize-chip"><span>${p.emoji}</span><small>${p.name}</small></div>`).join("");
}
function renderProfile(){
  const p=state.profile;if(!p)return;
  $("spinCount").textContent=`🎟 ${p.spins}`;$("balance").textContent=`💎 ${p.balance}`;
  $("availableSpins").textContent=p.spins;
  $("spinBtn").disabled=p.spins<1 || state.spinning;
  $("inventoryTotal").textContent=`${p.inventory.reduce((n,x)=>n+x.quantity,0)} предметов`;
  $("refCount").textContent=p.referrals;
  $("cooldown").textContent=p.spins>0?"":p.nextFreeAt?`Следующий бесплатный прокрут: ${new Date(p.nextFreeAt*1000).toLocaleString("ru-RU")}`:"";
  renderInventory();renderTasks();
}
function renderInventory(){
  const items=state.profile.inventory;
  $("inventoryGrid").innerHTML=items.length?items.map(x=>`<div class="inventory-item"><span>${emojiFor(x.item_key)}</span><b>${x.item_name}</b><small>Количество: ${x.quantity}</small></div>`).join(""):`<div class="empty-state">🍒<br><br>Пока здесь пусто.<br>Крути колесо, чтобы получить первый приз!</div>`;
}
function renderTasks(){
  $("tasksList").innerHTML=state.config.tasks.map(t=>{
    const done=state.profile.claims.includes(t.id);
    return `<div class="task-card"><div class="task-icon">✦</div><div class="task-info"><b>${t.title}</b><small>${t.description} · +${t.reward} прокрутка</small></div><button class="task-action ${done?"done":""}" data-task="${t.id}" ${done?"disabled":""}>${done?"Получено":"Проверить"}</button></div>`;
  }).join("");
  document.querySelectorAll("[data-task]").forEach(b=>b.addEventListener("click",()=>claimTask(b.dataset.task)));
}
async function claimTask(id){
  try{const data=await api("/api/claim-task",{method:"POST",body:JSON.stringify({taskId:id})});state.profile=data.profile;renderProfile();toast("Награда получена!");}
  catch(e){toast(e.message)}
}
async function spin(){
  if(state.spinning||state.profile.spins<1)return;
  state.spinning=true;$("spinBtn").disabled=true;
  try{
    const data=await api("/api/spin",{method:"POST",body:"{}"});
    const idx=state.config.prizes.findIndex(p=>p.key===data.prize.key);
    const slice=360/state.config.prizes.length;
    const target=360*6+(360-(idx*slice+slice/2));
    state.rotation+=target;
    $("wheel").style.transform=`rotate(${state.rotation}deg)`;
    setTimeout(()=>{
      state.profile=data.profile;renderProfile();
      $("modalEmoji").textContent=data.prize.emoji;$("modalTitle").textContent=`${data.prize.name}!`;
      $("modalText").textContent="Поздравляем! Предмет добавлен в твой инвентарь.";
      $("modal").classList.add("show");state.spinning=false;
    },4300);
  }catch(e){state.spinning=false;renderProfile();toast(e.message)}
}
function showTab(tab){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $(`${tab}Screen`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
}
async function load(){
  try{
    state.config=await api("/api/config");
    state.profile=await api(`/api/me?startapp=${encodeURIComponent(startParam)}`);
    state.referral=await api("/api/referral");
    $("refLink").textContent=state.referral.link;
    renderWheel();renderProfile();
  }catch(e){toast(e.message);$("spinBtn").disabled=true}
}
$("spinBtn").addEventListener("click",spin);
$("paidSpinBtn").addEventListener("click",()=>toast("Платные вращения через Telegram Stars подключаются после настройки платежей."));
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.go)));
$("inviteBtn").addEventListener("click",()=>{
  const link=state.referral?.link;if(!link)return;
  const text=encodeURIComponent("Залетай в Cherry Spins! Крутим колесо и собираем подарки 🍒");
  if(tg?.openTelegramLink)tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`);
  else navigator.clipboard?.writeText(link).then(()=>toast("Ссылка скопирована"));
});
$("copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(state.referral.link);toast("Ссылка скопирована")}catch{toast(state.referral.link)}});
$("modalClose").addEventListener("click",()=>$("modal").classList.remove("show"));
$("modalOk").addEventListener("click",()=>$("modal").classList.remove("show"));
load();
