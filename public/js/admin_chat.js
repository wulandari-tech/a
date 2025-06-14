document.addEventListener('DOMContentLoaded', () => {
    const socket = io({
        transports: ['websocket', 'polling'] // Coba tambahkan transports
    });
    const adminChatUserList = document.getElementById('adminChatUserList');
    const adminChatMessages = document.getElementById('adminChatMessages');
    const adminChatForm = document.getElementById('adminChatForm');
    const adminMessageInput = document.getElementById('adminMessageInput');
    const noActiveChatsDiv = document.getElementById('noActiveChats');
    const adminChatPlaceholder = document.getElementById('adminChatPlaceholder');

    let activeUsers = {};
    let currentChattingWith = null;
    const adminUsername = document.body.dataset.currentUser ? JSON.parse(document.body.dataset.currentUser).username : 'Admin';

    console.log('Admin Chat JS Loaded. Attempting to connect socket...');

    socket.on('connect', () => {
        console.log('Admin Socket Connected. Emitting admin_join.');
        socket.emit('admin_join');
    });

    socket.on('connect_error', (err) => {
        console.error('Admin Socket Connection Error:', err);
    });

    function renderUserList() {
        if (!adminChatUserList) return;
        if (Object.keys(activeUsers).length === 0) {
            if (noActiveChatsDiv) noActiveChatsDiv.style.display = 'block';
            adminChatUserList.innerHTML = '';
            adminChatUserList.appendChild(noActiveChatsDiv);
            return;
        }
        if (noActiveChatsDiv) noActiveChatsDiv.style.display = 'none';
        
        adminChatUserList.innerHTML = '';
        Object.entries(activeUsers).sort(([,a],[,b]) => (b.unread || 0) - (a.unread || 0) ).forEach(([userId, userData]) => {
            const userItem = document.createElement('a');
            userItem.href = '#';
            userItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            userItem.dataset.userId = userId;
            
            const nameAndPreview = document.createElement('div');
            nameAndPreview.innerHTML = `
                <h6 class="mb-0 user-name">${userData.username || 'User ' + userId.slice(-4)}</h6>
                <small class="text-muted preview d-block" style="font-size: 0.8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${userData.lastMessagePreview || 'Belum ada pesan'}</small>
            `;
            userItem.appendChild(nameAndPreview);

            if (userData.unread > 0) {
                const unreadBadge = document.createElement('span');
                unreadBadge.className = 'badge bg-danger rounded-pill ms-2';
                unreadBadge.textContent = userData.unread;
                userItem.appendChild(unreadBadge);
            }
            
            userItem.addEventListener('click', (e) => {
                e.preventDefault();
                openChatWithUser(userId);
            });
            adminChatUserList.appendChild(userItem);
        });

        if (currentChattingWith) {
            const activeUserElem = adminChatUserList.querySelector(`.list-group-item[data-user-id="${currentChattingWith}"]`);
            if (activeUserElem) activeUserElem.classList.add('active');
        }
    }

    function appendMessageToAdminChat(data, isSentByAdmin = false) {
        if (!adminChatMessages) return;
        if (adminChatPlaceholder) adminChatPlaceholder.style.display = 'none';
        
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', isSentByAdmin ? 'sent' : 'received');
        
        let senderName = data.senderName || (isSentByAdmin ? adminUsername : (activeUsers[data.sender]?.username || 'User'));

        const textContentDiv = document.createElement('div');
        textContentDiv.textContent = data.text;
        const sanitizedText = textContentDiv.innerHTML.replace(/\n/g, '<br>');

        messageDiv.innerHTML = `
            <span class="sender">${senderName}</span>
            ${sanitizedText}
            <span class="timestamp">${new Date(data.timestamp || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' })}</span>
        `;
        adminChatMessages.appendChild(messageDiv);
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    }

    async function openChatWithUser(userId) {
        if (!userId) return;
        if (currentChattingWith === userId && adminChatMessages.children.length > 1 && adminChatPlaceholder.style.display === 'none') {
            console.log(`Already chatting with ${userId} and messages loaded.`);
            return; 
        }
        console.log(`Opening chat with user: ${userId}`);
        currentChattingWith = userId;
        if (activeUsers[userId]) {
            activeUsers[userId].unread = 0;
        }
        renderUserList();

        adminChatMessages.innerHTML = '';
        if (adminChatPlaceholder) {
            adminChatPlaceholder.style.display = 'flex';
            adminChatPlaceholder.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div> <p class="ms-2">Memuat pesan...</p>`;
        }
        if (adminChatForm) adminChatForm.style.display = 'flex';
        if (adminMessageInput) adminMessageInput.focus();

        console.log(`Emitting load_chat_history_for_admin for user: ${userId}`);
        socket.emit('load_chat_history_for_admin', { userId });
    }

    socket.on('initial_user_list_for_admin', (users) => {
        console.log('Received initial_user_list_for_admin:', users);
        activeUsers = users || {};
        renderUserList();
    });
    
    socket.on('user_activity_update', (userData) => {
        console.log('Received user_activity_update:', userData);
        if (userData && userData.userId) {
            activeUsers[userData.userId] = { // Update atau tambahkan user
                username: userData.username,
                unread: userData.unread || (activeUsers[userData.userId] ? activeUsers[userData.userId].unread : 0),
                lastMessagePreview: userData.lastMessagePreview || (activeUsers[userData.userId] ? activeUsers[userData.userId].lastMessagePreview : 'Status diperbarui'),
                status: userData.status
            };
            renderUserList();
        }
    });

    socket.on('chat_history_for_admin', (historyData) => {
        console.log('Received chat_history_for_admin for user:', historyData.userId, historyData.messages.length, "messages");
        if (historyData.userId !== currentChattingWith) return;

        adminChatMessages.innerHTML = '';
        if (adminChatPlaceholder) adminChatPlaceholder.style.display = 'none';

        if (historyData.messages && historyData.messages.length > 0) {
            historyData.messages.forEach(msg => {
                const isSentByAdmin = msg.senderType === 'admin';
                appendMessageToAdminChat({
                    sender: msg.sender,
                    senderName: msg.senderName,
                    text: msg.text,
                    timestamp: msg.timestamp
                }, isSentByAdmin);
            });
        } else {
            if (adminChatPlaceholder) {
                adminChatPlaceholder.style.display = 'flex';
                adminChatPlaceholder.innerHTML = `<i class="fas fa-comment"></i> <p>Mulai percakapan dengan ${activeUsers[historyData.userId]?.username || 'user ini'}.</p>`;
            }
        }
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    });
    
    socket.on('new_user_message_to_admin', (data) => {
        console.log('Received new_user_message_to_admin from:', data.senderName, data);
        if (!activeUsers[data.sender]) {
            activeUsers[data.sender] = { username: data.senderName, unread: 0, lastMessagePreview: '' };
        }
        activeUsers[data.sender].lastMessagePreview = data.text.substring(0, 30) + (data.text.length > 30 ? '...' : '');
        
        if (currentChattingWith === data.sender) {
            appendMessageToAdminChat(data, false);
            activeUsers[data.sender].unread = 0; // Langsung dibaca jika chatnya aktif
             socket.emit('mark_message_as_read_by_admin', { userId: data.sender }); // Optional: beritahu server
        } else {
            activeUsers[data.sender].unread = (activeUsers[data.sender].unread || 0) + 1;
        }
        renderUserList();
    });

    if (adminChatForm) {
        adminChatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const messageText = adminMessageInput.value.trim();
            if (messageText && currentChattingWith) {
                console.log(`Admin sending message to ${currentChattingWith}: "${messageText}"`);
                const messageData = {
                    receiver: currentChattingWith,
                    text: messageText,
                    timestamp: Date.now()
                };
                socket.emit('admin_reply_to_user', messageData);
                // Pesan akan muncul via 'admin_message_sent_confirmation'
                adminMessageInput.value = '';
                adminMessageInput.focus();
            }
        });
    }

    socket.on('admin_message_sent_confirmation', (data) => {
        console.log('Admin message sent confirmation received:', data);
        // Pastikan pesan ini untuk chat yang sedang aktif
        if (data.receiver === currentChattingWith) {
            appendMessageToAdminChat({
                sender: 'admin', // atau data.sender jika server mengirimkannya
                senderName: adminUsername, // atau data.senderName
                text: data.text,
                timestamp: data.timestamp
            }, true);
        }
         // Update last message preview di user list
        if (activeUsers[data.receiver]) {
            activeUsers[data.receiver].lastMessagePreview = "Anda: " + data.text.substring(0, 25) + (data.text.length > 25 ? '...' : '');
            renderUserList();
        }
    });

    renderUserList();
});