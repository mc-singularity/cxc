export async function onRequestGet(context) {
    const { env } = context;
    try {
        const { results } = await env.DB.prepare(`
            SELECT id, type, nickname, item, quantity, shelf_info,
                   logistics_from, logistics_to, status, location, deadline, created_at
            FROM orders
            WHERE status IN ('new', 'progress')
            ORDER BY created_at DESC
            LIMIT 50
        `).all();
        
        return new Response(JSON.stringify({ 
            success: true, 
            orders: results 
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=30'
            }
        });
    } catch (e) {
        console.error('GET orders error:', e);
        return jsonResponse({ success: false, error: 'Ошибка загрузки заказов' }, 500);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const data = await request.json();
        
        const type = String(data.type || '').trim();
        const nickname = String(data.nickname || '').trim().slice(0, 32);
        const contact = String(data.contact || '').trim().slice(0, 100);
        const item = String(data.item || '').trim().slice(0, 200);
        const quantity = String(data.quantity || '').trim().slice(0, 20);
        const shelfInfo = String(data.shelf_info || '').trim().slice(0, 300);
        const logisticsFrom = String(data.logistics_from || '').trim().slice(0, 200);
        const logisticsTo = String(data.logistics_to || '').trim().slice(0, 200);
        const comment = String(data.comment || '').trim().slice(0, 500);
        const location = String(data.location || '').trim().slice(0, 50);
        const deadline = String(data.deadline || '').trim().slice(0, 100);
        
        const validTypes = ['item', 'shelf', 'logistics'];
        if (!validTypes.includes(type)) return jsonResponse({ success: false, error: 'Неверный тип заказа' }, 400);
        if (!nickname || !contact) return jsonResponse({ success: false, error: 'Заполните ник и контакт' }, 400);
        if (!location) return jsonResponse({ success: false, error: 'Выберите точку' }, 400);
        if (type === 'item' && !item) return jsonResponse({ success: false, error: 'Укажите, что заказать' }, 400);
        if (type === 'shelf' && !shelfInfo) return jsonResponse({ success: false, error: 'Опишите товар' }, 400);
        if (type === 'logistics' && (!logisticsFrom || !logisticsTo)) return jsonResponse({ success: false, error: 'Укажите откуда и куда' }, 400);
        
        if (data.website) return jsonResponse({ success: true }, 200);
        
        const now = Date.now();
        const result = await env.DB.prepare(`
            INSERT INTO orders 
            (type, nickname, contact, item, quantity, shelf_info, 
             logistics_from, logistics_to, comment, status, 
             location, deadline, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
        `).bind(
            type, nickname, contact, item || null, quantity || null,
            shelfInfo || null, logisticsFrom || null, logisticsTo || null,
            comment || null, location || null, deadline || null,
            now, now
        ).run();
        
        const orderId = result.meta.last_row_id;
        
        await sendToTelegram(env, {
            id: orderId, type, nickname, contact, item, quantity,
            shelf_info: shelfInfo, logistics_from: logisticsFrom,
            logistics_to: logisticsTo, comment, location, deadline
        });
        
        return jsonResponse({ success: true, id: orderId }, 200);
    } catch (e) {
        console.error('POST order error:', e);
        return jsonResponse({ success: false, error: 'Ошибка создания заказа' }, 500);
    }
}

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function sendToTelegram(env, order) {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;
    
    const typeLabels = {
        'item': '📦 ЗАКАЗ ТОВАРА',
        'shelf': '🏪 ЗАПРОС НА ПОЛКУ',
        'logistics': '🚚 ЗАКАЗ ЛОГИСТИКИ'
    };
    
    let message = `${typeLabels[order.type] || '📦 ЗАКАЗ'} #${order.id}\n\n`;
    message += `<b>От:</b> <code>${escapeHTML(order.nickname)}</code>\n`;
    message += `<b>Контакт:</b> ${escapeHTML(order.contact)}\n\n`;
    
    if (order.type === 'item') {
        message += `<b>Товар:</b> ${escapeHTML(order.item)}\n`;
        if (order.quantity) message += `<b>Количество:</b> ${escapeHTML(order.quantity)}\n`;
    } else if (order.type === 'shelf') {
        message += `<b>Что продавать:</b>\n${escapeHTML(order.shelf_info)}\n`;
    } else if (order.type === 'logistics') {
        message += `<b>Откуда:</b> ${escapeHTML(order.logistics_from)}\n`;
        message += `<b>Куда:</b> ${escapeHTML(order.logistics_to)}\n`;
    }
    
    if (order.location) message += `\n<b>Точка:</b> ${escapeHTML(order.location)}\n`;
    if (order.deadline) message += `<b>Срок:</b> ${escapeHTML(order.deadline)}\n`;
    if (order.comment) message += `\n<b>Комментарий:</b>\n${escapeHTML(order.comment)}`;
    message += `\n\n🕒 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`;
    
    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId, text: message,
                parse_mode: 'HTML', disable_web_page_preview: true
            })
        });
    } catch (e) {
        console.error('Telegram error:', e);
    }
}

function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
