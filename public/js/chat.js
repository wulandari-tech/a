document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); 

    const liveChatModalElement = document.getElementById('liveChatModal');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const chatToggleButton = document.getElementById('chatToggleButton');
    
    let liveChatModal;
    if (liveChatModalElement) {
        liveChatModal = new bootstrap.Modal(liveChatModalElement);
    }

    let username = localStorage.getItem('chatUsername');
    if (!username) {
        const randomId = Math.floor(Math.random() * 10000);
        username = `Pengguna${randomId}`;
        localStorage.setItem('chatUsername', username);
    }
    
    let currentLoggedInUser = null;
    if (document.body.dataset.currentUser) {
        try {
            currentLoggedInUser = JSON.parse(document.body.dataset.currentUser);
            if (currentLoggedInUser && currentLoggedInUser.username) {
                username = currentLoggedInUser.username;
            }
        } catch(e) { console.warn("Could not parse current user data for chat.");}
    }


    if (liveChatModalElement) {
        liveChatModalElement.addEventListener('shown.bs.modal', () => {
            if(chatInput) chatInput.focus();
            if(chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
            if(chatToggleButton) chatToggleButton.classList.remove('has-new-message');
        });
    }


    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const messageText = chatInput.value.trim();
            if (messageText) {
                const isAdminChat = currentLoggedInUser && currentLoggedInUser.role === 'admin';
                socket.emit('sendMessage', { user: username, text: messageText, isAdmin: isAdminChat, userId: currentLoggedInUser ? currentLoggedInUser.id : null });
                appendMessage({ user: username, text: messageText, timestamp: new Date(), isAdmin: isAdminChat }, true);
                chatInput.value = '';
            }
        });
    }

    socket.on('newMessage', (messageData) => {
        const isOwnMessage = messageData.user && username && messageData.user.toLowerCase() === username.toLowerCase();
        
        if (!isOwnMessage) { 
             appendMessage(messageData, false);
             if (currentLoggedInUser && currentLoggedInUser.role === 'admin' && !messageData.isAdmin) {
                showToastNotification(`Pesan baru dari ${messageData.user}: "${messageData.text.substring(0,20)}..."`, 'info');
                if(chatToggleButton && (!liveChatModalElement || !liveChatModalElement.classList.contains('show')) ){
                    chatToggleButton.classList.add('has-new-message');
                }
             }
        } else if (isOwnMessage && messageData.isAdmin && currentLoggedInUser && currentLoggedInUser.role === 'admin') {
            // Jika admin mengirim pesan sendiri, tidak perlu notif, sudah di appendMessage
        }
    });
    
    socket.on('newInfoBoardUpdate', (infoData) => {
        const infoBoardElement = document.getElementById('dynamicInfoBoard'); 
        if(infoBoardElement) {
            const item = document.createElement('li');
            item.innerHTML = `<i class="fas fa-info-circle"></i> <strong>${infoData.title || 'Update Baru'}:</strong> ${infoData.content}`;
            infoBoardElement.insertBefore(item, infoBoardElement.firstChild);
        }
        showToastNotification(`Info Baru: ${infoData.title || infoData.content.substring(0,30)}...`);
    });


    function appendMessage(data, isOwnMessage = false) {
        if (!chatMessages) return;
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message');

        let senderDisplay = data.user || 'Anonim';
        let messageTypeClass = 'other';

        if (isOwnMessage) {
            messageTypeClass = 'user';
            senderDisplay = data.isAdmin && currentLoggedInUser && currentLoggedInUser.role === 'admin' ? `${username} (Admin)` : 'Anda';
        } else if (data.isAdmin) {
            messageTypeClass = 'admin';
            senderDisplay = `${data.user} (Admin Support)`;
        }
        
        messageElement.classList.add(messageTypeClass);

        messageElement.innerHTML = `
            <span class="sender">${escapeHTML(senderDisplay)}</span>
            <div class="text-content">${escapeHTML(data.text)}</div>
            <span class="timestamp">${new Date(data.timestamp || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; 
    }
    
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        var p = document.createElement("p");
        p.appendChild(document.createTextNode(str));
        return p.innerHTML;
    }

    function showToastNotification(message, type = 'info') {
        const toastContainer = document.querySelector('.alert-container');
        if (!toastContainer) {
            console.warn("Toast container (.alert-container) not found. Cannot show notification.");
            return;
        }

        const toastId = 'toast-' + Date.now();
        const toastHTML = `
            <div id="${toastId}" class="alert alert-${type} alert-dismissible fade show" role="alert" style="min-width: 250px; max-width:350px;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : (type === 'info' ? 'comments' : 'info-circle')} me-2"></i>
                ${escapeHTML(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = toastHTML;
        const toastElement = tempDiv.firstChild;
        
        toastContainer.insertBefore(toastElement, toastContainer.firstChild);

        setTimeout(() => {
            const currentToast = document.getElementById(toastId);
            if (currentToast) {
                 const bsAlert = bootstrap.Alert.getInstance(currentToast);
                 if (bsAlert) {
                    bsAlert.close();
                 } else {
                    currentToast.remove(); 
                 }
            }
        }, 8000);
    }
});