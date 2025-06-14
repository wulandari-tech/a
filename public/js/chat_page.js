document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const chatMessagesContainer = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatFormPage');
    const messageInput = document.getElementById('messageInputPage');
    const connectionStatusBadge = document.getElementById('chatConnectionStatus');
    const welcomeMessageDiv = document.getElementById('welcomeMessage');

    let currentUserData = null;
    const bodyCurrentUserData = document.body.dataset.currentUser;
    if (bodyCurrentUserData) {
        try {
            currentUserData = JSON.parse(bodyCurrentUserData);
        } catch (e) {
            console.error("Error parsing currentUser data from body:", e);
        }
    }

    if (!currentUserData) {
        if (connectionStatusBadge) connectionStatusBadge.textContent = 'Login Diperlukan';
        if (messageInput) messageInput.disabled = true;
        if (document.getElementById('sendMessageBtnPage')) document.getElementById('sendMessageBtnPage').disabled = true;
        const loginMessage = document.createElement('div');
        loginMessage.className = 'alert alert-warning text-center mt-3';
        loginMessage.innerHTML = 'Anda harus <a href="/login?returnTo=/chat">login</a> untuk menggunakan live chat.';
        if (chatMessagesContainer) chatMessagesContainer.appendChild(loginMessage);
        return;
    }

    function appendMessage(data, isSentByUser = false) {
        if (!chatMessagesContainer) return;
        if (welcomeMessageDiv && welcomeMessageDiv.parentNode === chatMessagesContainer) {
             // Hapus pesan sambutan jika sudah ada pesan riwayat atau pesan baru
            if (chatMessagesContainer.children.length > 1 || !data.isHistory) { // isHistory adalah flag custom jika dari history
                 chatMessagesContainer.removeChild(welcomeMessageDiv);
            }
        }


        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', isSentByUser ? 'sent' : 'received');
        
        let senderName = data.senderName || (data.sender === currentUserData.id ? currentUserData.username : 'Admin');
        if (data.sender === 'system') senderName = 'Sistem';

        // Basic HTML sanitization for text content
        const textContentDiv = document.createElement('div');
        textContentDiv.textContent = data.text; // Set as text to prevent XSS
        const sanitizedText = textContentDiv.innerHTML.replace(/\n/g, '<br>');


        messageDiv.innerHTML = `
            <span class="sender">${senderName}</span>
            ${sanitizedText}
            <span class="timestamp">${new Date(data.timestamp || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' })}</span>
        `;
        chatMessagesContainer.appendChild(messageDiv);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    socket.on('connect', () => {
        if (connectionStatusBadge) {
            connectionStatusBadge.textContent = 'Terhubung';
            connectionStatusBadge.classList.remove('bg-light', 'text-dark', 'bg-danger');
            connectionStatusBadge.classList.add('bg-success', 'text-white');
        }
        console.log('Terhubung ke server chat ID:', socket.id);
        if (currentUserData && currentUserData.id) {
            socket.emit('user_join', { userId: currentUserData.id, username: currentUserData.username });
            socket.emit('load_history', { userId: currentUserData.id });
        }
    });

    socket.on('disconnect', () => {
        if (connectionStatusBadge) {
            connectionStatusBadge.textContent = 'Terputus';
            connectionStatusBadge.classList.remove('bg-success', 'bg-light', 'text-dark');
            connectionStatusBadge.classList.add('bg-danger', 'text-white');
        }
    });

    socket.on('connect_error', (err) => {
        if (connectionStatusBadge) {
            connectionStatusBadge.textContent = 'Gagal Terhubung';
            connectionStatusBadge.classList.remove('bg-success', 'bg-light', 'text-dark');
            connectionStatusBadge.classList.add('bg-danger', 'text-white');
        }
        console.error('Koneksi gagal:', err.message);
    });

    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const messageText = messageInput.value.trim();
            if (messageText && currentUserData && currentUserData.id) {
                const messageData = {
                    sender: currentUserData.id,
                    senderName: currentUserData.username,
                    receiver: 'admin',
                    text: messageText,
                    timestamp: Date.now()
                };
                socket.emit('chat_message', messageData);
                // appendMessage(messageData, true); // Pesan akan dikonfirmasi oleh server
                messageInput.value = '';
                messageInput.focus();
            } else if (!currentUserData || !currentUserData.id) {
                alert('Anda harus login untuk mengirim pesan.');
            }
        });
    }

    socket.on('chat_message', (data) => {
        // Cek apakah pesan ini untuk user saat ini atau dari user saat ini
        const isSentByUser = data.sender === currentUserData.id;
        const isReceivedByThisUser = (data.receiver === currentUserData.id && data.sender === 'admin') || (data.sender === currentUserData.id && data.receiver === 'admin') ;

        if (isReceivedByThisUser || (isSentByUser && data.receiver === 'admin')) {
            appendMessage(data, isSentByUser);
        }
    });
    
    socket.on('chat_history', (history) => {
        if (history && history.length > 0) {
            if (welcomeMessageDiv && welcomeMessageDiv.parentNode === chatMessagesContainer) {
                chatMessagesContainer.removeChild(welcomeMessageDiv);
            }
           //  chatMessagesContainer.innerHTML = ''; // Bersihkan pesan yang mungkin ada sebelum load history
            history.forEach(msg => {
                const isSentByUser = msg.sender === currentUserData.id || msg.senderType === 'user'; // Sesuaikan jika senderType ada
                appendMessage({
                    sender: msg.sender,
                    senderName: msg.senderName,
                    text: msg.text,
                    timestamp: msg.timestamp,
                    isHistory: true // Flag custom
                }, isSentByUser);
            });
        } else if (chatMessagesContainer.children.length <= 1 && welcomeMessageDiv) {
            // Biarkan welcome message jika history kosong
        }
    });
});