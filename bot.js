const { Telegraf, Markup } = require("telegraf");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Создаем бота
require("dotenv").config();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Создаем базу данных
const dbPath = path.join(__dirname, "cashback.db");
const db = new sqlite3.Database(dbPath);

// Список банков
const BANKS = ["Т-Банк", "ВТБ", "Яндекс", "Озон Банк"];

// Инициализация базы данных
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS cashback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank TEXT NOT NULL,
        category TEXT NOT NULL,
        percentage REAL NOT NULL,
        UNIQUE(bank, category)
    )`);
});

// Состояния пользователей
const userStates = {};

// Функция для создания главного меню
function getMainMenu() {
  return Markup.keyboard([
    ["📝 Управление кешбэком"],
    ["🔍 Узнать кешбэк по категории"],
  ]).resize();
}

// Функция для создания меню управления кешбэком
function getCashbackManagementMenu() {
  return Markup.keyboard([
    ["💳 Т-Банк", "💳 ВТБ"],
    ["💳 Яндекс", "💳 Озон Банк"],
    ["🔙 Назад"],
  ]).resize();
}

// Функция для создания меню действий с банком
function getBankActionsMenu() {
  return Markup.keyboard([
    ["➕ Добавить категорию"],
    ["📋 Посмотреть категории"],
    ["✏️ Изменить категорию"],
    ["🗑️ Удалить категорию"],
    ["🔙 Назад"],
  ]).resize();
}

// Функция для создания кнопки "Назад"
function getBackButton() {
  return Markup.keyboard([["🔙 Назад"]]).resize();
}

// Старт бота
bot.start((ctx) => {
  ctx.reply(
    "Добро пожаловать в бот управления кешбэком! 💳\n\nВыберите действие:",
    getMainMenu()
  );
  delete userStates[ctx.from.id];
});

// Главное меню
bot.hears("📝 Управление кешбэком", (ctx) => {
  ctx.reply(
    "Выберите банк для управления кешбэком:",
    getCashbackManagementMenu()
  );
  userStates[ctx.from.id] = { state: "selecting_bank_for_management" };
});

bot.hears("🔍 Узнать кешбэк по категории", (ctx) => {
  // Получаем все уникальные категории из базы
  db.all(
    "SELECT DISTINCT category FROM cashback ORDER BY category",
    (err, rows) => {
      if (err) {
        ctx.reply("Произошла ошибка при получении категорий.");
        return;
      }

      if (rows.length === 0) {
        ctx.reply(
          'Категории не найдены. Сначала добавьте категории в разделе "Управление кешбэком".'
        );
        return;
      }

      const categories = rows.map((row) => row.category);
      const keyboard = [];

      // Создаем кнопки по 2 в ряд
      for (let i = 0; i < categories.length; i += 2) {
        const row = categories.slice(i, i + 2);
        keyboard.push(row);
      }
      keyboard.push(["🔙 Назад"]);

      ctx.reply(
        "Выберите категорию для просмотра кешбэка:",
        Markup.keyboard(keyboard).resize()
      );
      userStates[ctx.from.id] = { state: "selecting_category_for_view" };
    }
  );
});

// Обработка выбора банка для управления
BANKS.forEach((bank) => {
  bot.hears(`💳 ${bank}`, (ctx) => {
    if (userStates[ctx.from.id]?.state === "selecting_bank_for_management") {
      ctx.reply(
        `Вы выбрали ${bank}. Что хотите сделать?`,
        getBankActionsMenu()
      );
      userStates[ctx.from.id] = { state: "bank_selected", bank: bank };
    }
  });
});

// Добавление категории
bot.hears("➕ Добавить категорию", (ctx) => {
  const userState = userStates[ctx.from.id];
  if (userState?.state === "bank_selected") {
    ctx.reply("Введите название категории:", getBackButton());
    userStates[ctx.from.id] = { ...userState, state: "entering_category_name" };
  }
});

// Просмотр категорий банка
bot.hears("📋 Посмотреть категории", (ctx) => {
  const userState = userStates[ctx.from.id];
  if (userState?.state === "bank_selected") {
    db.all(
      "SELECT category, percentage FROM cashback WHERE bank = ? ORDER BY category",
      [userState.bank],
      (err, rows) => {
        if (err) {
          ctx.reply("Произошла ошибка при получении данных.");
          return;
        }

        if (rows.length === 0) {
          ctx.reply(
            `В банке ${userState.bank} пока нет добавленных категорий.`
          );
          return;
        }

        let message = `📋 Категории в ${userState.bank}:\n\n`;
        rows.forEach((row) => {
          message += `• ${row.category}: ${row.percentage}%\n`;
        });

        ctx.reply(message);
      }
    );
  }
});

// Изменение категории
bot.hears("✏️ Изменить категорию", (ctx) => {
  const userState = userStates[ctx.from.id];
  if (userState?.state === "bank_selected") {
    db.all(
      "SELECT category FROM cashback WHERE bank = ? ORDER BY category",
      [userState.bank],
      (err, rows) => {
        if (err) {
          ctx.reply("Произошла ошибка при получении данных.");
          return;
        }

        if (rows.length === 0) {
          ctx.reply(
            `В банке ${userState.bank} пока нет категорий для изменения.`
          );
          return;
        }

        const categories = rows.map((row) => row.category);
        const keyboard = [];

        for (let i = 0; i < categories.length; i += 2) {
          const row = categories.slice(i, i + 2);
          keyboard.push(row);
        }
        keyboard.push(["🔙 Назад"]);

        ctx.reply(
          "Выберите категорию для изменения:",
          Markup.keyboard(keyboard).resize()
        );
        userStates[ctx.from.id] = {
          ...userState,
          state: "selecting_category_to_edit",
        };
      }
    );
  }
});

// Удаление категории
bot.hears("🗑️ Удалить категорию", (ctx) => {
  const userState = userStates[ctx.from.id];
  if (userState?.state === "bank_selected") {
    db.all(
      "SELECT category FROM cashback WHERE bank = ? ORDER BY category",
      [userState.bank],
      (err, rows) => {
        if (err) {
          ctx.reply("Произошла ошибка при получении данных.");
          return;
        }

        if (rows.length === 0) {
          ctx.reply(
            `В банке ${userState.bank} пока нет категорий для удаления.`
          );
          return;
        }

        const categories = rows.map((row) => row.category);
        const keyboard = [];

        for (let i = 0; i < categories.length; i += 2) {
          const row = categories.slice(i, i + 2);
          keyboard.push(row);
        }
        keyboard.push(["🔙 Назад"]);

        ctx.reply(
          "Выберите категорию для удаления:",
          Markup.keyboard(keyboard).resize()
        );
        userStates[ctx.from.id] = {
          ...userState,
          state: "selecting_category_to_delete",
        };
      }
    );
  }
});

// Обработка кнопки "Назад"
bot.hears("🔙 Назад", (ctx) => {
  const userState = userStates[ctx.from.id];

  if (!userState) {
    ctx.reply("Выберите действие:", getMainMenu());
    return;
  }

  switch (userState.state) {
    case "selecting_bank_for_management":
      ctx.reply("Выберите действие:", getMainMenu());
      delete userStates[ctx.from.id];
      break;

    case "bank_selected":
    case "selecting_category_to_edit":
    case "selecting_category_to_delete":
      ctx.reply(
        "Выберите банк для управления кешбэком:",
        getCashbackManagementMenu()
      );
      userStates[ctx.from.id] = { state: "selecting_bank_for_management" };
      break;

    case "entering_category_name":
    case "entering_percentage":
    case "entering_new_percentage":
      ctx.reply(
        `Вы выбрали ${userState.bank}. Что хотите сделать?`,
        getBankActionsMenu()
      );
      userStates[ctx.from.id] = {
        state: "bank_selected",
        bank: userState.bank,
      };
      break;

    case "selecting_category_for_view":
      ctx.reply("Выберите действие:", getMainMenu());
      delete userStates[ctx.from.id];
      break;

    default:
      ctx.reply("Выберите действие:", getMainMenu());
      delete userStates[ctx.from.id];
  }
});

// Обработка текстовых сообщений
bot.on("text", (ctx) => {
  const userState = userStates[ctx.from.id];
  const text = ctx.message.text;

  if (!userState) return;

  switch (userState.state) {
    case "entering_category_name":
      if (text === "🔙 Назад") return;

      ctx.reply(
        `Введите процент кешбэка для категории "${text}" в банке ${userState.bank}:`,
        getBackButton()
      );
      userStates[ctx.from.id] = {
        ...userState,
        state: "entering_percentage",
        category: text,
      };
      break;

    case "entering_percentage":
      if (text === "🔙 Назад") return;

      const percentage = parseFloat(text);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        ctx.reply(
          "Пожалуйста, введите корректный процент (число от 0 до 100):",
          getBackButton()
        );
        return;
      }

      db.run(
        "INSERT OR REPLACE INTO cashback (bank, category, percentage) VALUES (?, ?, ?)",
        [userState.bank, userState.category, percentage],
        (err) => {
          if (err) {
            ctx.reply("Произошла ошибка при сохранении данных.");
            return;
          }

          ctx.reply(
            `✅ Категория "${userState.category}" с кешбэком ${percentage}% добавлена в ${userState.bank}!`
          );
          ctx.reply(
            `Что еще хотите сделать с ${userState.bank}?`,
            getBankActionsMenu()
          );
          userStates[ctx.from.id] = {
            state: "bank_selected",
            bank: userState.bank,
          };
        }
      );
      break;

    case "selecting_category_to_edit":
      if (text === "🔙 Назад") return;

      db.get(
        "SELECT percentage FROM cashback WHERE bank = ? AND category = ?",
        [userState.bank, text],
        (err, row) => {
          if (err || !row) {
            ctx.reply("Категория не найдена.");
            return;
          }

          ctx.reply(
            `Текущий кешбэк для категории "${text}": ${row.percentage}%\n\nВведите новый процент:`,
            getBackButton()
          );
          userStates[ctx.from.id] = {
            ...userState,
            state: "entering_new_percentage",
            category: text,
          };
        }
      );
      break;

    case "entering_new_percentage":
      if (text === "🔙 Назад") return;

      const newPercentage = parseFloat(text);
      if (isNaN(newPercentage) || newPercentage < 0 || newPercentage > 100) {
        ctx.reply(
          "Пожалуйста, введите корректный процент (число от 0 до 100):",
          getBackButton()
        );
        return;
      }

      db.run(
        "UPDATE cashback SET percentage = ? WHERE bank = ? AND category = ?",
        [newPercentage, userState.bank, userState.category],
        (err) => {
          if (err) {
            ctx.reply("Произошла ошибка при обновлении данных.");
            return;
          }

          ctx.reply(
            `✅ Кешбэк для категории "${userState.category}" в ${userState.bank} изменен на ${newPercentage}%!`
          );
          ctx.reply(
            `Что еще хотите сделать с ${userState.bank}?`,
            getBankActionsMenu()
          );
          userStates[ctx.from.id] = {
            state: "bank_selected",
            bank: userState.bank,
          };
        }
      );
      break;

    case "selecting_category_to_delete":
      if (text === "🔙 Назад") return;

      db.run(
        "DELETE FROM cashback WHERE bank = ? AND category = ?",
        [userState.bank, text],
        (err) => {
          if (err) {
            ctx.reply("Произошла ошибка при удалении данных.");
            return;
          }

          ctx.reply(`✅ Категория "${text}" удалена из ${userState.bank}!`);
          ctx.reply(
            `Что еще хотите сделать с ${userState.bank}?`,
            getBankActionsMenu()
          );
          userStates[ctx.from.id] = {
            state: "bank_selected",
            bank: userState.bank,
          };
        }
      );
      break;

    case "selecting_category_for_view":
      if (text === "🔙 Назад") return;

      db.all(
        "SELECT bank, percentage FROM cashback WHERE category = ? ORDER BY percentage DESC",
        [text],
        (err, rows) => {
          if (err) {
            ctx.reply("Произошла ошибка при получении данных.");
            return;
          }

          if (rows.length === 0) {
            ctx.reply(
              `Для категории "${text}" кешбэк не настроен ни в одном банке.`
            );
            return;
          }

          let message = `💳 Кешбэк по категории "${text}":\n\n`;
          rows.forEach((row, index) => {
            const emoji =
              index === 0
                ? "🥇"
                : index === 1
                ? "🥈"
                : index === 2
                ? "🥉"
                : "•";
            message += `${emoji} ${row.bank}: ${row.percentage}%\n`;
          });

          ctx.reply(message);
        }
      );
      break;
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error("Ошибка в боте:", err);
  ctx.reply("Произошла ошибка. Попробуйте еще раз.");
});

// Запуск бота
bot.launch();

// Graceful shutdown
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  db.close();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  db.close();
});

console.log("Бот запущен!");
