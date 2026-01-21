import ITEMS_TO_WATCH from './db_xp.js';
import readline from 'readline';

// ================= TELEGRAM =================
const BOT_TOKEN = '8212301892:AAFGNTLNXhzo04DPfpd-VbgUdKUru6KxN44';
const CHAT_ID = '-1003066433402';

// ================= API =================
const API = 'https://api-v1.degenidle.com/api/market/items';

// ================= ESTADO =================
let TOTAL_GASTO = 0;
let TOTAL_XP = 0;
let TOTAL_QTD = 0;

const ITEM_MSG_IDS = new Map();
const SUMMARY_MSG_IDS = new Map();

// ================= CONSTANTS =================
const CATEGORIES = {
  cooking: [
    'Grilled Minnow', 'Roasted Snapper', 'Spicy Barracuda', 'Frosted Sawfish Filet',
    'Shark Stew', 'Angler Soup', 'Abyss Feast', 'Spiced Sea Wyrm', 'Stormray Filet',
    'Leviathan Roast', 'Marrow Roast', 'Oasis Platter'
  ],
  alchemy: ['Potion', 'Extract', 'Resin', 'Essence', 'Distillate', 'Sap', 'Powder', 'Infusion'],
  tailoring: ['Gemstone', 'Cloth', 'Glove', 'Hat', 'Robe', 'Shoe', 'Staff'],
  forging: [' Bar', 'Bodyarmor', 'Boots', 'Glove', 'Helmet', 'Shield', 'Sword', 'Handle'],
  crafting: ['Axe', 'Pickaxe', 'Trap', 'Rod', 'Pouch', 'Basket', 'Amulet', 'Ring'],
  leatherworking: ['Bow', 'Bowstring', 'Leather', 'Thick', 'Sturdy', 'Heavy', 'Tough', 'Reinforced', 'Shadowhide', 'Dragonhide', 'Abyssal'],
  woodcraft: ['Plank', 'Charm']
};


const LEATHER_MATS = ['Leather', 'Thick', 'Sturdy', 'Heavy', 'Tough', 'Reinforced', 'Shadowhide', 'Dragonhide', 'Abyssal'];

const EQUIPMENT_KEYWORDS = [
  'Bodyarmor', 'Boots', 'Glove', 'Helmet', 'Shield', 'Sword', 'Hat', 'Robe', 'Shoe',
  'Staff', 'Bow', 'Axe', 'Pickaxe', 'Trap', 'Rod', 'Charm', 'Pouch', 'Basket', 'Amulet', 'Ring'
];

// ================= UTILS =================
const sleep = (min, max) => new Promise(r => setTimeout(r, Math.random() * (max - min) + min));

function getItemCategory(name) {
  const n = name.toLowerCase();

  // 1. Prioridade Leatherworking (Armaduras com materiais de leather)
  const isArmor = ['bodyarmor', 'boots', 'gloves', 'helmet', 'hat'].some(type => n.includes(type));
  if (isArmor && LEATHER_MATS.some(m => n.includes(m.toLowerCase()))) return 'leatherworking';
  if (n.includes('bow')) return 'leatherworking';

  // 2. Prioridade Forging (Luvas metálicas)
  const FORGING_METALS = ['Adamantite', 'Copper', 'Eternium', 'Gold', 'Iron', 'Mithril', 'Nyxium', 'Platinum', 'Silver'];
  if (n.includes('glove') && FORGING_METALS.some(m => n.includes(m.toLowerCase()))) return 'forging';

  // 3. Outras Categorias
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(k => {
      const lowerK = k.toLowerCase();
      if (lowerK === ' bar') return /\sbar\b/i.test(n);
      return n.includes(lowerK);
    })) return cat;
  }

  return 'outros';
}

function getItemSubCategory(name) {
  const n = name.toLowerCase();
  const isEquip = EQUIPMENT_KEYWORDS.some(k => n.includes(k.toLowerCase()));
  return isEquip ? 'equipment' : 'resources';
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => {
    rl.close();
    r(a.trim());
  }));
}

function fmt(n) {
  return Number(n).toLocaleString('pt-BR');
}

async function sendTelegram(msg) {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: msg,
        parse_mode: 'Markdown'
      })
    });
    const json = await response.json();
    return json.result ? json.result.message_id : null;
  } catch (e) {
    console.log('Erro ao enviar Telegram:', e.message);
    return null;
  }
}

async function deleteTelegramMessage(msgId) {
  if (!BOT_TOKEN || !CHAT_ID || !msgId) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        message_id: msgId
      })
    });
  } catch (e) {
    console.log('Erro ao deletar msg Telegram:', e.message);
  }
}

// ================= CORE =================
const MARKET_STATE = new Map(); // Key: ItemID_Rarity_Price, Value: Quantity

async function processItem(item, maxGxp, isFirstRun) {
  const id = item.ID;
  if (!id) {
    console.log('ID NÃO ENCONTRADO:', item.Name);
    return null; // Return stats
  }

  const grouped = new Map();
  let page = 1;
  let hasMore = true;
  let lastPageData = '';

  // Fetch all pages
  while (hasMore) {
    try {
      const res = await fetch(`${API}/${id}/market?page=${page}`);
      const json = await res.json();

      if (!json?.success) break;

      const orders = json.data.sell_orders || [];
      if (!orders.length) {
        hasMore = false;
        break;
      }

      const currentPageData = JSON.stringify(orders);
      if (currentPageData === lastPageData) { // Loop detection
        hasMore = false;
        break;
      }
      lastPageData = currentPageData;

      for (const o of orders) {
        const orderRarity = (o.rarity || 'common').toLowerCase();

        // Find matching variant
        const variant = item.Variants.find(v => v.Rarity.toLowerCase() === orderRarity);
        if (!variant) continue;

        const gxp = o.price / variant.XP;
        if (gxp > maxGxp) continue;

        const key = `${o.price}_${variant.XP}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            price: o.price,
            xp: variant.XP,
            rarity: variant.Rarity,
            qty: 0
          });
        }
        grouped.get(key).qty += o.quantity;
      }

      if (orders.length < 25) hasMore = false;
      else {
        page++;
        await sleep(200, 500); // Small delay between pages
      }
    } catch (e) {
      console.error(`Erro buscando ${item.Name}:`, e.message);
      hasMore = false;
    }
  }

  if (!grouped.size) {
    // If no valid orders found (empty), but we have a lingering message, delete it.
    if (ITEM_MSG_IDS.has(item.Name)) {
      await deleteTelegramMessage(ITEM_MSG_IDS.get(item.Name));
      ITEM_MSG_IDS.delete(item.Name);
    }
    return null;
  }

  // Process findings and Compare with State
  let anyNewItem = false;
  let itemMsg =
    "```\n" +
    `ITEM: ${item.Name}\n\n` +
    `PRICE   | XP   | G/XP  | QTY\n` +
    `--------+------+-------+------\n`;

  let itemStats = { expense: 0, xp: 0, qty: 0 };

  for (const [key, g] of grouped) {
    const stateKey = `${id}_${g.rarity}_${g.price}`;
    const previousQty = MARKET_STATE.get(stateKey) || 0;
    const currentQty = g.qty;

    // Update State
    MARKET_STATE.set(stateKey, currentQty);

    // Check if NEW items were added
    if (currentQty > previousQty) {
      anyNewItem = true;
    }

    // Always show full quantity in message
    itemMsg +=
      `${fmt(g.price).padStart(7)} | ` +
      `${fmt(g.xp).padStart(4)} | ` +
      `${(g.price / g.xp).toFixed(2).padStart(5)} | ` +
      `${fmt(currentQty).padStart(4)}\n`;

    // Stats for summary (count only new items for the "Cycle Report" logic? 
    // User logic: "New items found -> Update dashboard". 
    // But specific "Stats" for the Summary Report usually imply "What I found/bought this cycle".
    // For consistency with the dashboard logic (replacing messages), the Summary should probably also act as a Dashboard of "Current Active Offers"?
    // Or strictly "New Findings Log"?
    // The user kept "Relatório" (Report). Let's keep stats accumulation based on NEW items to trigger the "Something happened" logic,
    // but maybe the Summary message itself should also replace the old one?
    // Let's stick to accumulating NEW stats for the decision to ping.

    if (currentQty > previousQty) {
      const delta = currentQty - previousQty;
      itemStats.expense += g.price * delta;
      itemStats.xp += g.xp * delta;
      itemStats.qty += delta;
    }
  }

  itemMsg += "```";

  // LOGIC: Only send msg is NEW items found OR First Run
  if (anyNewItem || isFirstRun) {
    console.log(`Scan: ${item.Name} -> Novos itens/FirstRun`);

    // 1. Send new message
    const msgId = await sendTelegram(itemMsg);

    if (msgId) {
      // 2. Delete old message if exists (only if new one was sent)
      if (ITEM_MSG_IDS.has(item.Name)) {
        await deleteTelegramMessage(ITEM_MSG_IDS.get(item.Name));
      }
      // 3. Save new message ID
      ITEM_MSG_IDS.set(item.Name, msgId);
    }

    return itemStats;
  }

  // If NO new items, but we have 0 quantity now (Sold out?), we might want to delete the old message?
  // Current logic: If 0 items, 'grouped' is likely empty, so we return null at line 170.
  // Wait, if no sell orders, line 125 breaks. Line 170 returns null.
  // If we return null, we don't handle the "Delete empty" logic.
  // We need to handle the "Sold Out" case (Empty Grouped) inside the caller or here?
  // Since 'grouped' is populated from API, if API returns empty, 'grouped' is empty.
  // We should check ITEM_MSG_IDS for item.Name even if grouped is empty?
  // The current structure returns early if grouped.size is 0. 
  // Let's modify the caller or the early return? 
  // Modifying the Early Return (Line 170) is safer.

  return null;
}

// ================= RUN =================
async function run() {
  console.log('=== BOT INICIADO ===');
  const MAX_GXP = 2.0;

  // 1. Group Items by Filter
  const groups = new Map(); // FilterString -> [Items]

  for (const item of ITEMS_TO_WATCH) {
    const cat = getItemCategory(item.Name);
    const sub = getItemSubCategory(item.Name);

    // Map 'equipment' to 'equip' for display/grouping
    const subDisplay = sub === 'equipment' ? 'equip' : sub;

    // FILTROS IGNORADOS
    if (cat === 'crafting' || cat === 'leatherworking' || cat === 'cooking' || cat === 'forging') continue;
    if (cat === 'tailoring' && subDisplay === 'equip') continue;

    const filterKey = `${cat} / ${subDisplay}`;

    if (!groups.has(filterKey)) groups.set(filterKey, []);
    groups.get(filterKey).push(item);
  }

  // Sort Filter Keys
  const sortedKeys = Array.from(groups.keys()).sort();

  let isFirstRun = true;

  while (true) {
    console.log(`\n=== INICIANDO CICLO (FirstRun: ${isFirstRun}) ===\n`);
    const startTime = Date.now();

    for (const filter of sortedKeys) {
      console.log(`>>> Processando Filtro: ${filter}`);
      const items = groups.get(filter);

      let filterStats = { expense: 0, xp: 0, qty: 0 };

      for (const item of items) {
        const result = await processItem(item, MAX_GXP, isFirstRun);
        if (result) {
          filterStats.expense += result.expense;
          filterStats.xp += result.xp;
          filterStats.qty += result.qty;
        }
        // Small delay between items to avoid rate limits
        await sleep(200, 1000);
      }

      // Filter Report
      if (filterStats.qty > 0) {
        const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const summaryMsg =
          `📊 *RELATÓRIO: ${filter.toUpperCase()}*\n` +
          `💰 GASTO: ${fmt(filterStats.expense)}\n` +
          `✨ XP: ${fmt(filterStats.xp)}\n` +
          `📦 QTD (Novos): ${fmt(filterStats.qty)}\n` +
          `⚖️ MÉDIA G/XP: ${(filterStats.expense / filterStats.xp).toFixed(3)}\n` +
          `🕒 ATUALIZADO EM: ${now}`;

        const sMsgId = await sendTelegram(summaryMsg);

        if (sMsgId) {
          // Delete old summary for this filter only if new one sent
          if (SUMMARY_MSG_IDS.has(filter)) {
            await deleteTelegramMessage(SUMMARY_MSG_IDS.get(filter));
          }
          SUMMARY_MSG_IDS.set(filter, sMsgId);
        }
      }
    }

    isFirstRun = false;

    const minutes = Math.floor(Math.random() * (30 - 10 + 1) + 10);
    console.log(`\n=== CICLO FINALIZADO ===`);
    console.log(`Aguardando ${minutes} minutos para o próximo ciclo...`);

    await sleep(minutes * 60 * 1000, minutes * 60 * 1000); // Sleep minutes
  }
}

run();
