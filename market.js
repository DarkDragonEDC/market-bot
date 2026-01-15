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
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: msg,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {
    console.log('Erro ao enviar Telegram');
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

  if (!grouped.size) return null;

  // Process findings and Compare with State
  let newItemFound = false;
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

    let quantityToNotify = currentQty;

    // Logic: 
    // If first run, notify all (user asked "read all items").
    // If next runs, notify only NEW quantity (current - previous).
    // If current <= previous, it means no new items added (or successful sales occurred), so ignore.

    if (!isFirstRun) {
      if (currentQty > previousQty) {
        quantityToNotify = currentQty - previousQty;
      } else {
        quantityToNotify = 0;
      }
    }

    if (quantityToNotify > 0) {
      newItemFound = true;
      itemMsg +=
        `${fmt(g.price).padStart(7)} | ` +
        `${fmt(g.xp).padStart(4)} | ` +
        `${(g.price / g.xp).toFixed(2).padStart(5)} | ` +
        `${fmt(quantityToNotify).padStart(4)}\n`;

      itemStats.expense += g.price * quantityToNotify;
      itemStats.xp += g.xp * quantityToNotify;
      itemStats.qty += quantityToNotify;
    }
  }

  itemMsg += "```";

  if (newItemFound) {
    console.log(`Scan: ${item.Name} -> Novos itens encontrados!`);
    await sendTelegram(itemMsg);
    return itemStats;
  }

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
    if (cat === 'crafting') continue; // IGNORAR CRAFTING

    const sub = getItemSubCategory(item.Name);

    // Map 'equipment' to 'equip' for display/grouping
    const subDisplay = sub === 'equipment' ? 'equip' : sub;
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
        await sendTelegram(
          `📊 *RELATÓRIO: ${filter.toUpperCase()}*\n` +
          `💰 GASTO: ${fmt(filterStats.expense)}\n` +
          `✨ XP: ${fmt(filterStats.xp)}\n` +
          `📦 QTD: ${fmt(filterStats.qty)}\n` +
          `⚖️ MÉDIA G/XP: ${(filterStats.expense / filterStats.xp).toFixed(3)}`
        );
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
