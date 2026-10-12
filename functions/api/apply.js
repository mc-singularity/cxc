export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const data = await request.json();
        
        const nickname = String(data.nickname || '').trim().slice(0, 32);
        const contact = String(data.contact || '').trim().slice(0, 100);
        const type = String(data.type || 'staff').trim();
        const motivation = String(data.motivation || '').trim().slice(0, 1000);
        const skills = String(data.skills || '').trim().slice(0, 500);
        
        if (!nickname || !contact) return jsonResponse({ success: false, error: 'Заполните ник и контакт' }, 400);
        if (!['staff', 'partner'].includes(type)) return jsonResponse({ success: false, error: 'Неверный тип' }, 400);
        if (data.website) return jsonResponse({ success: true }, 200);
        
        const now = Date.now();
        
        const result = await env.DB.prepare(`
            INSERT INTO applications 
            (nickname, contact, type, motivation, skills, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'new', ?, ?)
        `).bind(nickname, contact, type, motivation, skills, now, now).run();
        
        await sendApplyToTelegram(env, {
            id: result.meta.last_row_id, nickname, contact, type, motivation, skills
        });
        
        return jsonResponse({ success: true, id: result.meta.last_row_id }, 200);
    } catch (e) {
        console.error('POST apply error:', e);
        return jsonResponse({ success: false, error: 'Ошибка отправки' }, 500);
    }
}

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function sendApplyToTelegram(env, app) {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;
    
    const typeLabel = app.type === 'staff' ? '👤 ВСТУПЛЕНИЕ В ШТАТ' : '🤝 ПАРТНЁРСТВО';
    
    let message = `${typeLabel} #${app.id}\n\n`;
    message += `<b>Ник:</b> <code>${escapeHTML(app.nickname)}</code>\n`;
    message += `<b>Контакт:</b> ${escapeHTML(app.contact)}\n\n`;
    if (app.skills) message += `<b>Навыки:</b>\n${escapeHTML(app.skills)}\n\n`;
    if (app.motivation) message += `<b>Мотивация:</b>\n${escapeHTML(app.motivation)}\n`;
    message += `\n🕒 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`;
    
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
