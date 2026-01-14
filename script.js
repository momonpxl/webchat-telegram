// ==================== KONFIGURASI ====================
const CONFIG = {
    BOT_TOKEN: "ISI_BOT_TOKEN_LU",
    ADMIN_CHAT_ID: "ISI_ID_CHAT_LU",
    APP_NAME: "Telegram Web Messenger",
    SOUND_ENABLED: true,
    DARK_MODE: false,
    POLLING_INTERVAL: 5, // Diperbesar dari 3 ke 5 detik
    ENCRYPTION_ENABLED: false,
    ENCRYPTION_KEY: "",
     
    TEMPLATES: {
        halo: "Halo! Ada yang bisa saya bantu?",
        tanya: "Boleh saya tanya sesuatu?",
        terimakasih: "Terima kasih atas bantuannya!",
        tanyalagi: "Ada pertanyaan lain?",
        ok: "Baik, saya mengerti.",
        tunggu: "Mohon tunggu sebentar..."
    },
    
    AUTO_REPLY: {
        enabled: true,
        message: "Pesan Anda sudah diterima. Admin akan membalas secepatnya."
    },
    
    EMOJIS: ["😀", "😂", "🥰", "😎", "😭", "😡", "🤔", "👋", "👍", "❤️", 
            "🔥", "✨", "🎉", "💯", "🤖", "📱", "💻", "📎", "📄", "🔒"]
};

// ==================== STATE APLIKASI ====================
let appState = {
    isConnected: false,
    lastUpdateId: 0,
    pollingInterval: null,
    chatHistory: [],
    selectedFile: null,
    botInfo: null,
    processedMessageIds: new Set(), // Untuk track pesan yang sudah diproses
    lastMessageTimestamp: 0 // Untuk debounce
};

// ==================== ELEMENTS ====================
const el = {
    chatMessages: document.getElementById('chatMessages'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    themeToggle: document.getElementById('themeToggle'),
    notification: document.getElementById('notification'),
    typingIndicator: document.getElementById('typingIndicator'),
    emojiPicker: document.getElementById('emojiPicker'),
    emojiToggle: document.getElementById('emojiToggle'),
    fileInput: document.getElementById('fileInput'),
    fileUpload: document.getElementById('fileUpload'),
    filePreview: document.getElementById('filePreview'),
    botName: document.getElementById('botName'),
    adminId: document.getElementById('adminId'),
    connectionStatus: document.getElementById('connectionStatus')
};

// ==================== FUNGSI UTILITAS ====================
function showNotification(message, isError = false) {
    el.notification.textContent = message;
    el.notification.className = `notification ${isError ? 'error' : ''}`;
    el.notification.style.display = 'block';
    
    if (CONFIG.SOUND_ENABLED && !isError) {
        const sound = document.getElementById('notificationSound');
        sound.currentTime = 0;
        sound.play().catch(e => console.log('Suara tidak dapat diputar'));
    }
    
    setTimeout(() => {
        el.notification.style.display = 'none';
    }, 3000);
}

function updateStatus(isConnected, message) {
    appState.isConnected = isConnected;
    el.statusDot.className = `status-dot ${isConnected ? '' : 'offline'}`;
    el.statusText.textContent = message;
    el.connectionStatus.textContent = isConnected ? 'Terhubung' : 'Terputus';
    
    if (isConnected && appState.botInfo) {
        el.botName.textContent = appState.botInfo.first_name;
    }
    
    el.adminId.textContent = CONFIG.ADMIN_CHAT_ID;
    
    el.messageInput.disabled = !isConnected;
    el.sendButton.disabled = !isConnected;
}

function formatTime(date) {
    return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== FUNGSI CHAT DENGANT PERBAIKAN DOUBLE ====================
function addMessage(text, isUser = false, sender = null, messageId = null) {
    // Generate ID unik jika tidak ada
    if (!messageId) {
        messageId = `${isUser ? 'user' : 'bot'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Cek jika pesan ini sudah diproses (untuk mencegah double)
    if (appState.processedMessageIds.has(messageId)) {
        console.log('Pesan sudah ada, dilewati:', messageId.substring(0, 20));
        return false;
    }
    
    // Tambah ke set pesan yang sudah diproses
    appState.processedMessageIds.add(messageId);
    
    // Debounce: cek jika pesan terlalu cepat setelah pesan sebelumnya
    const now = Date.now();
    if (!isUser && (now - appState.lastMessageTimestamp < 1000)) {
        console.log('Debounce: pesan terlalu cepat setelah sebelumnya');
        return false;
    }
    appState.lastMessageTimestamp = now;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    messageDiv.dataset.messageId = messageId;
    
    const senderName = isUser ? 'Anda' : (sender || 'Admin');
    const time = formatTime(new Date());
    
    messageDiv.innerHTML = `
        <div class="message-sender">${senderName}</div>
        <div class="message-bubble">${formatText(text)}</div>
        <div class="message-time">${time}</div>
    `;
    
    el.chatMessages.appendChild(messageDiv);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    
    saveToHistory(text, isUser, senderName, time, messageId);
    
    console.log(`Pesan ${isUser ? 'dikirim' : 'diterima'} [${messageId.substring(0, 10)}...]`);
    return true;
}

function formatText(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

function saveToHistory(text, isUser, sender, time, messageId) {
    const message = {
        id: messageId,
        text,
        isUser,
        sender,
        time,
        timestamp: Date.now()
    };
    
    appState.chatHistory.push(message);
    
    // Simpan maksimal 200 pesan
    if (appState.chatHistory.length > 200) {
        appState.chatHistory = appState.chatHistory.slice(-200);
    }
    
    localStorage.setItem('chatHistory', JSON.stringify(appState.chatHistory));
    
    // Simpan juga processed IDs
    const savedIds = JSON.parse(localStorage.getItem('processedIds') || '[]');
    if (!savedIds.includes(messageId)) {
        savedIds.push(messageId);
        if (savedIds.length > 300) {
            savedIds.splice(0, savedIds.length - 300);
        }
        localStorage.setItem('processedIds', JSON.stringify(savedIds));
    }
}

function loadHistory() {
    const saved = localStorage.getItem('chatHistory');
    const savedIds = JSON.parse(localStorage.getItem('processedIds') || '[]');
    
    // Load processed message IDs
    appState.processedMessageIds = new Set(savedIds);
    
    if (saved) {
        appState.chatHistory = JSON.parse(saved);
        appState.chatHistory.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.isUser ? 'user' : 'bot'}`;
            div.dataset.messageId = msg.id;
            div.innerHTML = `
                <div class="message-sender">${msg.sender}</div>
                <div class="message-bubble">${formatText(msg.text)}</div>
                <div class="message-time">${msg.time}</div>
            `;
            el.chatMessages.appendChild(div);
        });
        el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    } else {
        addMessage(
            `Selamat datang di ${CONFIG.APP_NAME}! ` +
            `Bot telah dikonfigurasi dan siap digunakan.`,
            false,
            'Sistem',
            'system_welcome'
        );
    }
}

// ==================== TELEGRAM API FUNCTIONS DENGAN PERBAIKAN ====================
async function sendTelegramMessage(text, file = null) {
    if (!CONFIG.BOT_TOKEN || !CONFIG.ADMIN_CHAT_ID) {
        showNotification('Konfigurasi bot belum lengkap', true);
        return false;
    }
    
    // Generate ID unik untuk pesan keluar
    const messageId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Tambah pesan ke UI dengan ID
    const added = addMessage(text, true, 'Anda', messageId);
    if (!added) {
        console.log('Pesan tidak ditambahkan (mungkin duplikat)');
        return false;
    }
    
    el.messageInput.value = '';
    
    try {
        let response;
        
        if (file) {
            const formData = new FormData();
            formData.append('chat_id', CONFIG.ADMIN_CHAT_ID);
            formData.append('document', file);
            if (text.trim()) {
                formData.append('caption', text);
            }
            
            response = await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendDocument`, {
                method: 'POST',
                body: formData
            });
        } else {
            response = await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CONFIG.ADMIN_CHAT_ID,
                    text: text,
                    parse_mode: 'HTML'
                })
            });
        }
        
        const data = await response.json();
        
        if (data.ok) {
            console.log('Pesan berhasil dikirim ke Telegram');
            showNotification('Pesan terkirim!');
            
            // Auto-reply dengan delay
            if (CONFIG.AUTO_REPLY.enabled) {
                setTimeout(() => {
                    const autoReplyId = `auto_${Date.now()}`;
                    addMessage(CONFIG.AUTO_REPLY.message, false, 'Auto-Reply', autoReplyId);
                }, 1500);
            }
            
            return true;
        } else {
            throw new Error(data.description || 'Gagal mengirim');
        }
    } catch (error) {
        console.error('Error mengirim pesan:', error);
        showNotification(`Gagal mengirim: ${error.message}`, true);
        return false;
    }
}

async function checkForMessages() {
    if (!appState.isConnected || !CONFIG.BOT_TOKEN) {
        return;
    }
    
    try {
        const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getUpdates?offset=${appState.lastUpdateId + 1}&timeout=3`;
        console.log('Polling Telegram API...');
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            console.log(`Received ${data.result.length} updates`);
            
            el.typingIndicator.style.display = 'flex';
            await new Promise(resolve => setTimeout(resolve, 800));
            el.typingIndicator.style.display = 'none';
            
            let newMessagesCount = 0;
            
            for (const update of data.result) {
                // Update lastUpdateId
                if (update.update_id > appState.lastUpdateId) {
                    appState.lastUpdateId = update.update_id;
                }
                
                // Process message
                if (update.message && update.message.text) {
                    const message = update.message.text;
                    const sender = update.message.from.first_name || 'Admin';
                    const messageId = `tg_${update.message.message_id}`;
                    
                    // Filter hanya pesan dari admin yang dikonfigurasi
                    if (update.message.chat.id.toString() === CONFIG.ADMIN_CHAT_ID) {
                        // Gunakan fungsi addMessage dengan ID untuk cek duplikasi
                        const added = addMessage(message, false, sender, messageId);
                        if (added) {
                            newMessagesCount++;
                            console.log('Pesan baru dari admin ditambahkan');
                        } else {
                            console.log('Pesan dari admin sudah ada (duplikat)');
                        }
                    }
                }
            }
            
            if (newMessagesCount > 0) {
                showNotification(`${newMessagesCount} pesan baru dari admin!`);
            }
        }
    } catch (error) {
        console.log('Polling error:', error);
        el.typingIndicator.style.display = 'none';
    }
}

async function connectToBot() {
    if (!CONFIG.BOT_TOKEN) {
        updateStatus(false, 'Token bot tidak ditemukan');
        return;
    }
    
    updateStatus(false, 'Menghubungkan ke bot...');
    
    try {
        const response = await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getMe`);
        const data = await response.json();
        
        if (data.ok) {
            appState.botInfo = data.result;
            updateStatus(true, `Terhubung ke ${data.result.first_name}`);
            
            // Start polling with delay
            setTimeout(() => {
                startPolling();
            }, 1000);
            
            showNotification(`Bot ${data.result.first_name} siap!`);
        } else {
            throw new Error(data.description || 'Gagal terhubung');
        }
    } catch (error) {
        console.error('Connection error:', error);
        updateStatus(false, 'Gagal terhubung');
        showNotification(`Error: ${error.message}`, true);
    }
}

function startPolling() {
    if (appState.pollingInterval) {
        clearInterval(appState.pollingInterval);
    }
    
    // Gunakan interval yang lebih besar untuk hindari rate limit
    appState.pollingInterval = setInterval(() => {
        checkForMessages();
    }, CONFIG.POLLING_INTERVAL * 1000);
    
    console.log(`Polling dimulai setiap ${CONFIG.POLLING_INTERVAL} detik`);
    
    // Cek pesan pertama kali
    setTimeout(() => {
        checkForMessages();
    }, 2000);
}

function stopPolling() {
    if (appState.pollingInterval) {
        clearInterval(appState.pollingInterval);
        appState.pollingInterval = null;
    }
    console.log('Polling dihentikan');
}

// ==================== EMOJI PICKER ====================
function initEmojiPicker() {
    CONFIG.EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.onclick = () => {
            el.messageInput.value += emoji;
            el.emojiPicker.style.display = 'none';
            el.messageInput.focus();
        };
        el.emojiPicker.appendChild(btn);
    });
    
    el.emojiToggle.onclick = (e) => {
        e.stopPropagation();
        el.emojiPicker.style.display = el.emojiPicker.style.display === 'grid' ? 'none' : 'grid';
    };
    
    document.addEventListener('click', (e) => {
        if (!el.emojiPicker.contains(e.target) && e.target !== el.emojiToggle) {
            el.emojiPicker.style.display = 'none';
        }
    });
}

// ==================== FILE UPLOAD ====================
function initFileUpload() {
    el.fileUpload.onclick = () => el.fileInput.click();
    
    el.fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            appState.selectedFile = file;
            
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    el.filePreview.innerHTML = `
                        <img src="${event.target.result}" style="max-width: 100px; border-radius: 5px;">
                        <div style="margin-top: 5px; font-size: 12px;">
                            ${file.name} (${(file.size / 1024).toFixed(1)} KB)
                        </div>
                    `;
                    el.filePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                el.filePreview.innerHTML = `
                    <div><i class="fas fa-file"></i> ${file.name}</div>
                    <div style="font-size: 12px;">${(file.size / 1024).toFixed(1)} KB</div>
                `;
                el.filePreview.style.display = 'block';
            }
        }
    };
}

// ==================== TEMPLATE BUTTONS ====================
function initTemplateButtons() {
    document.querySelectorAll('.quick-btn[data-template]').forEach(btn => {
        btn.onclick = () => {
            const template = btn.dataset.template;
            if (CONFIG.TEMPLATES[template]) {
                el.messageInput.value = CONFIG.TEMPLATES[template];
                el.messageInput.focus();
            }
        };
    });
}

// ==================== EVENT LISTENERS ====================
function initEventListeners() {
    // Kirim pesan dengan Enter
    el.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = el.messageInput.value.trim();
            if (text) {
                sendTelegramMessage(text, appState.selectedFile);
                appState.selectedFile = null;
                el.filePreview.style.display = 'none';
                el.filePreview.innerHTML = '';
                el.fileInput.value = '';
            }
        }
    });
    
    // Kirim pesan dengan tombol
    el.sendButton.onclick = () => {
        const text = el.messageInput.value.trim();
        if (text) {
            sendTelegramMessage(text, appState.selectedFile);
            appState.selectedFile = null;
            el.filePreview.style.display = 'none';
            el.filePreview.innerHTML = '';
            el.fileInput.value = '';
        }
    };
    
    // Dark mode toggle
    el.themeToggle.onclick = () => {
        document.body.classList.toggle('dark-mode');
        const icon = el.themeToggle.querySelector('i');
        if (document.body.classList.contains('dark-mode')) {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
        CONFIG.DARK_MODE = document.body.classList.contains('dark-mode');
    };
    
    // Set initial theme
    if (CONFIG.DARK_MODE) {
        document.body.classList.add('dark-mode');
        el.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

// ==================== INISIALISASI ====================
function init() {
    console.log('=== Telegram Web Messenger (No Double) ===');
    console.log('Konfigurasi loaded');
    console.log('- Polling Interval:', CONFIG.POLLING_INTERVAL, 'detik');
    
    initEventListeners();
    initEmojiPicker();
    initFileUpload();
    initTemplateButtons();
    
    loadHistory();
    
    connectToBot();
}

// ==================== START APPLICATION ====================
document.addEventListener('DOMContentLoaded', init);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopPolling();
});

// Pause polling ketika tab tidak aktif
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Tab tidak aktif, polling dijeda');
        stopPolling();
    } else {
        console.log('Tab aktif kembali, polling dilanjutkan');
        if (appState.isConnected) {
            startPolling();
        }
    }
});
