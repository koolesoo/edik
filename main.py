import logging
import requests
from telegram import Update
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters, CallbackContext
from config import BOT_TOKEN

API_URL = "http://localhost:5001"
login_states = {}

logging.basicConfig(level=logging.INFO)

def start(update: Update, context: CallbackContext):
    chat_id = update.effective_chat.id
    update.message.reply_text(
        "👋 Привет! Чтобы связать аккаунт, отправьте:\n\n"
        "login ваш_логин пароль ваш_пароль"
    )
    login_states[chat_id] = "awaiting_login"

def handle_login(update: Update, context: CallbackContext):
    chat_id = update.effective_chat.id
    text = update.message.text.strip()

    if not text.lower().startswith("login "):
        return

    try:
        parts = text.split()
        username = parts[1]
        if "пароль" in parts:
            password = parts[parts.index("пароль") + 1]
        else:
            password = parts[2]

        resp = requests.post(f"{API_URL}/api/login", json={
            "username": username,
            "password": password
        })

        if resp.status_code != 200:
            update.message.reply_text("❌ Неверный логин или пароль.")
            return

        user_id = resp.json()["user"]["id"]

        reg = requests.post(f"{API_URL}/api/telegram-bind", json={
            "user_id": user_id,
            "chat_id": chat_id
        })

        if reg.status_code == 200:
            update.message.reply_text(f"✅ Готово! Пользователь {username} привязан к Telegram.")
        else:
            update.message.reply_text("⚠️ Не удалось привязать Telegram. Попробуйте позже.")

    except Exception as e:
        logging.error(f"Ошибка авторизации: {e}")
        update.message.reply_text("Произошла ошибка. Попробуйте снова.")

    login_states.pop(chat_id, None)

def result(update: Update, context: CallbackContext):
    chat_id = update.effective_chat.id

    try:
        # Получаем ID пользователя по chat_id
        user_resp = requests.get(f"{API_URL}/api/user-by-chat/{chat_id}")
        if user_resp.status_code != 200:
            update.message.reply_text("Вы не привязаны к сайту. Введите логин и пароль.")
            return

        user_id = user_resp.json()["id"]

        # Получаем любимую команду с матчами
        team_resp = requests.get(f"{API_URL}/api/fav-team/full/{user_id}")
        if team_resp.status_code != 200:
            update.message.reply_text("Не удалось получить информацию о команде.")
            return

        data = team_resp.json()
        team = data.get("team")
        last = data.get("last_match")
        next_ = data.get("next_match")

        if not team:
            update.message.reply_text("У вас не выбрана любимая команда.")
            return

        messages = []

        if last:
            messages.append(
                f"📅 Последний матч {team['name']}:\n"
                f"{last['homeTeam']['name']} {last['score']['fullTime']['home']} : "
                f"{last['score']['fullTime']['away']} {last['awayTeam']['name']}\n"
                f"🕒 {last['utcDate']}"
            )
        if next_:
            messages.append(
                f"🔜 Следующий матч {team['name']}:\n"
                f"{next_['homeTeam']['name']} vs {next_['awayTeam']['name']}\n"
                f"🕒 {next_['utcDate']}"
            )

        if not messages:
            update.message.reply_text("Нет информации о матчах.")
        else:
            update.message.reply_text("\n\n".join(messages))

    except Exception as e:
        logging.error(f"Ошибка в /result: {e}")
        update.message.reply_text("Произошла ошибка при получении информации.")

def main():
    updater = Updater(BOT_TOKEN, use_context=True)
    dp = updater.dispatcher
    dp.add_handler(CommandHandler("start", start))
    dp.add_handler(CommandHandler("result", result))
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_login))
    updater.start_polling()
    updater.idle()

if __name__ == "__main__":
    main()