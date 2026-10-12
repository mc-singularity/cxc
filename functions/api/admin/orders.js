// GET /api/admin/orders — список всех заказов
// PATCH /api/admin/orders — смена статуса

export async function onRequestGet(context) {
    const { env } = context;
    
    try {
        const { results } = await env.DB.prepare(`
            SELECT id, type, nickname, contact, item, quantity, shelf_info,
                   logistics_from, logistics_to, comment, status,
                   location, deadline, created_at, updated_at
            FROM orders
            ORDER BY created_at DESC
            LIMIT 200
        `).all();
        
        return jsonResponse({ success: true, orders: results });
    } catch (e) {
        console.error('Admin GET orders error:', e);
        return jsonResponse({ success: false, error: 'Ошибка' }, 500);
    }
}

export async function onRequestPatch(context) {
    const { request, env } = context;
    
    try {
        const data = await request.json();
        const id = parseInt(data.id);
        const status = String(data.status || '').trim();
        
        const validStatuses = ['new', 'progress', 'done', 'cancelled'];
        if (!id || !validStatuses.includes(status)) {
            return jsonResponse({ success: false, error: 'Неверные данные' }, 400);
        }
        
        const now = Date.now();
        
        await env.DB.prepare(`
            UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
        `).bind(status, now, id).run();
        
        return jsonResponse({ success: true });
    } catch (e) {
        console.error('Admin PATCH order error:', e);
        return jsonResponse({ success: false, error: 'Ошибка' }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
