
const API = 'https://api-v1.degenidle.com/api/market/items/200/market?page=1'; // 200 is Abyssal Bodyarmor

async function check() {
    try {
        const res = await fetch(API);
        const json = await res.json();
        if (json.data && json.data.sell_orders && json.data.sell_orders.length > 0) {
            console.log(JSON.stringify(json.data.sell_orders[0], null, 2));
        } else {
            console.log("No orders found or empty.");
            console.log(JSON.stringify(json, null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

check();
