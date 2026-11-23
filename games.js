// Cherry Spins — game hub add-on. Load after /app.js.
(() => {
  const root = document.getElementById("gamesScreen");
  if (!root) return;

  const gameInfo = {
    slots: ["🎰", "Cherry Slots", "Аркадные комбинации и коллекция символов."],
    rocket: ["🚀", "Cherry Rocket", "Следи за полётом и тренируй чувство момента в бесплатном режиме."],
    cases: ["🎁", "Cherry Cases", "Открывай виртуальные коллекционные кейсы без денежных ставок."],
    mines: ["💣", "Cherry Mines", "Логическая сетка: находи безопасные клетки и избегай ловушек."],
    pvp: ["⚔️", "Cherry PvP", "Соревнуйся с друзьями в раундах на очки и рейтинг."],
    giveaways: ["🏆", "Розыгрыши", "Смотри активные события, правила и результаты."],
    workers: ["🛠️", "Workers", "Развивай мастерскую и собирай игровые ресурсы."],
    risk: ["🧪", "Risk Bar", "Аркадные испытания на реакцию и последовательность."],
    plinko: ["🔴", "Cherry Plinko", "Запускай шарики в бесплатной аркадной физической головоломке."],
    lucky: ["🍀", "Lucky", "Ежедневные задания, серии и достижения."],
    upgrader: ["💎", "Cherry Upgrader", "Улучшай виртуальные предметы и собирай редкие варианты."],
    minecraft: ["⛏️", "Cherry Craft", "Добывай ресурсы, строй и создавай предметы."]
  };

  root.querySelectorAll("[data-game]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = gameInfo[button.dataset.game];
      if (!item) return;
      const emoji = document.getElementById("modalEmoji");
      const title = document.getElementById("modalTitle");
      const message = document.getElementById("modalText");
      const modal = document.getElementById("modal");
      if (emoji && title && message && modal) {
        emoji.textContent = item[0];
        title.textContent = item[1];
        message.textContent = item[2] + " Этот режим добавлен в план разработки; игровая механика подключается следующим этапом.";
        modal.classList.add("show");
      }
    });
  });
})();
