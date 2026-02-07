# Telegram Message Examples

## 1. How the Bot Sends a Message (Push)
When your `market.js` script runs, it sends a POST request to Telegram.

### HTTP Request Example:
```http
POST https://api.telegram.org/bot<TOKEN>/sendMessage
Content-Type: application/json

{
  "chat_id": "-1003066433402",
  "text": "📊 *RELATÓRIO: ALCHEMY / RESOURCES*\n💰 GASTO: 10.000\n✨ XP: 5.000\n📦 QTD (Novos): 2\n⚖️ MÉDIA G/XP: 2.000\n🕒 ATUALIZADO EM: 09:15",
  "parse_mode": "Markdown"
}
```

### How it looks in Telegram:
> 📊 **RELATÓRIO: ALCHEMY / RESOURCES**
> 💰 GASTO: 10.000
> ✨ XP: 5.000
> 📦 QTD (Novos): 2
> ⚖️ MÉDIA G/XP: 2.000
> 🕒 ATUALIZADO EM: 09:15

---

## 2. How the Bot Receives a Message (Pull/Hook)
If a user sends a message to your bot, it "arrives" at Telegram's servers first. Your bot can get it in two ways:

### A. Long Polling (Checking for updates)
The bot asks: "Anything new?"
```javascript
async function getUpdates() {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
  const data = await response.json();
  
  if (data.ok && data.result.length > 0) {
    data.result.forEach(update => {
      console.log("Chegou uma mensagem:", update.message.text);
    });
  }
}
```

### B. Webhook (Telegram pushes to you)
Telegram sends a POST request to your server immediately.
```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "from": { "id": 12345, "first_name": "User" },
    "chat": { "id": -1003066433402, "type": "supergroup" },
    "date": 1707296889,
    "text": "/stats"
  }
}
```

---

## 4. Exemplo de Mensagem de Item (Tabela)
Quando o robô detecta um item específico que atende aos critérios (G/XP < 1.5), ele envia uma mensagem organizada em formato de tabela.

### Como a mensagem é construída no código:
```javascript
let itemMsg =
  "```\n" +
  `ITEM: ${item.Name}\n\n` +
  `PRICE   | XP   | G/XP  | QTY\n` +
  `--------+------+-------+------\n`;

// Loop que adiciona as linhas...
itemMsg += "```";
```

### Como ela chega no seu Telegram:
> ```
> ITEM: Abyssal Bodyarmor
> 
> PRICE   | XP   | G/XP  | QTY
> --------+------+-------+------
>  10.000 |  800 |  12.50 |    5
>  12.500 |  800 |  15.63 |    2
> ```

### Comportamento de "Dashboard":
Diferente do relatório, que acumula o que foi "achado de novo", a mensagem do item tenta mostrar a **oferta atual completa** no mercado.
- Se o item aparece pela primeira vez ou tem itens novos: Envia uma nova mensagem.
- Se já existia uma mensagem desse item no chat: O robô **apaga a antiga** e manda a nova (`deleteTelegramMessage`).
- Isso faz com que você sempre tenha apenas **uma mensagem por item**, representando o estado atual do mercado para aquele filtro.
