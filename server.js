require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const flash = require('connect-flash');
const TelegramBot = require('node-telegram-bot-api');
const midtransClient = require('midtrans-client');

const { getActiveInformationItems } = require('./controllers/informationBoardController');
const User = require('./models/user');
const Order = require('./models/order');
const Deposit = require('./models/deposit');
const Withdrawal = require('./models/withdrawal');
const ChatMessage = require('./models/chatMessage');
const InformationBoardItem = require('./models/informationBoardItem');
const Product = require('./models/product');

const authRoutes = require('./routes/authRoutes');
const storeRoutes = require('./routes/storeRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const ppobRoutes = require('./routes/ppobRoutes');
const pterodactylRoutes = require('./routes/pterodactylRoutes');
const digitalOceanRoutes = require('./routes/digitalOceanRoutes');
const docsRoutes = require('./routes/docsRoutes');
const ewalletTransferRoutes = require('./routes/ewalletTransferRoutes');
const withdrawalRoutes = require('./routes/withdrawalRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const midtransRoutes = require('./routes/midtransRoutes');

const { isAuthenticated, isAdmin, isGuest, isSellerApproved } = require('./middleware/authMiddleware');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

const snap = new midtransClient.Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});
app.set('midtransSnap', snap);

let maintenanceMode = process.env.MAINTENANCE_MODE === 'true';
let telegramBot;

if (process.env.TELEGRAM_BOT_TOKEN) {
    telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    app.set('telegramBot', telegramBot);
    console.log('Telegram Bot terhubung dan polling...');

    telegramBot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const welcomeMessage = `🤖 Selamat datang di Bot ${process.env.STORE_NAME}!\n\nPerintah yang tersedia:\n/menu - Tampilkan menu bot\n/status - Cek status server\n/myid - Lihat ID Telegram Anda\n\nJika Anda adalah Owner/Admin, Anda mungkin memiliki perintah tambahan.`;
        telegramBot.sendMessage(chatId, welcomeMessage);
    });
    
    telegramBot.onText(/\/menu/, (msg) => {
        const chatId = msg.chat.id;
        let menuMessage = "Menu Bot:\n/status - Cek status server\n/myid - Lihat ID Telegram Anda";
        if (process.env.TELEGRAM_OWNER_ID && chatId.toString() === process.env.TELEGRAM_OWNER_ID) {
            menuMessage += "\n\nOwner Commands:\n/down on - Aktifkan Maintenance\n/down off - Nonaktifkan Maintenance";
        }
        telegramBot.sendMessage(chatId, menuMessage);
    });

    telegramBot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        telegramBot.sendMessage(chatId, `Server ${process.env.STORE_NAME} berjalan normal.\nMaintenance Mode: ${maintenanceMode ? 'AKTIF' : 'NONAKTIF'}`);
    });
     telegramBot.onText(/\/myid/, (msg) => {
        const chatId = msg.chat.id;
        telegramBot.sendMessage(chatId, `ID Telegram Anda adalah: \`${chatId}\``, { parse_mode: 'Markdown' });
    });
    
    telegramBot.onText(/\/down (on|off)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const state = match[1];

        if (process.env.TELEGRAM_OWNER_ID && chatId.toString() === process.env.TELEGRAM_OWNER_ID) {
            maintenanceMode = (state === 'on');
            const statusText = maintenanceMode ? 'AKTIF' : 'NONAKTIF';
            telegramBot.sendMessage(chatId, `Mode Maintenance Website sekarang: *${statusText}*`, { parse_mode: 'Markdown' });
        } else {
            telegramBot.sendMessage(chatId, "Perintah tidak diotorisasi.");
        }
    });

    telegramBot.on('polling_error', (error) => {
        console.error("Telegram Polling Error:", error.code, error.message ? ` - ${error.message.substring(0,100)}` : '');
    });

} else {
    console.warn("TELEGRAM_BOT_TOKEN tidak diset. Fitur Telegram bot tidak aktif.");
}

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Terhubung...'))
    .catch(err => console.error('Koneksi MongoDB Gagal:', err));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('trust proxy', 1); // Penting untuk Railway/Heroku agar secure cookie bekerja

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'native'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);
app.use(flash());

let storeNameGlobal = process.env.STORE_NAME || "QOUPAY STORE";

app.use(async (req, res, next) => {
    if (maintenanceMode && 
        !req.path.startsWith('/admin') && 
        !req.path.startsWith('/api/midtrans/notification') && 
        req.path !== '/login' && 
        !(req.session.user && req.session.user.role === 'admin')) {
        return res.status(503).render('maintenance', {
             pageTitle: 'Situs Dalam Perbaikan',
             storeName: storeNameGlobal,
             storeWhatsappLink: process.env.STORE_WHATSAPP_LINK || '#',
             storePhoneNumber: process.env.STORE_PHONE_NUMBER || 'N/A',
             currentUser: req.session.user,
        });
    }
    res.locals.currentUser = req.session.user;
    res.locals.storeName = storeNameGlobal;
    res.locals.storeWhatsappLink = process.env.STORE_WHATSAPP_LINK || "https://wa.me/6285167089173";
    res.locals.storePhoneNumber = process.env.STORE_PHONE_NUMBER || "0851-6708-9173";
    res.locals.baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const getFlashArray = (type) => {
        const messages = req.flash(type);
        return Array.isArray(messages) ? messages : (messages ? [messages] : []);
    };

    res.locals.success_messages = getFlashArray('success_messages');
    res.locals.error_messages = getFlashArray('error_messages');
    res.locals.info_messages = getFlashArray('info_messages');
    res.locals.adminError = getFlashArray('adminError');
    res.locals.adminSuccess = getFlashArray('adminSuccess');

    let currentErrorsToShow = [];
    const validationErrors = getFlashArray('validation_errors'); // Jika Anda flash validation errors ke sini
    if (validationErrors.length > 0) {
        currentErrorsToShow = currentErrorsToShow.concat(validationErrors.map(e => e.msg || e));
    }
    const loginErrorsFlashed = getFlashArray('loginError'); // Digunakan oleh authRoutes lama Anda
     if (loginErrorsFlashed.length > 0) {
        currentErrorsToShow = currentErrorsToShow.concat(loginErrorsFlashed);
    }
    const genericError = getFlashArray('currentError'); // Untuk string error biasa
    if (genericError.length > 0) {
        currentErrorsToShow = currentErrorsToShow.concat(genericError);
    }
    res.locals.currentError = currentErrorsToShow.length > 0 ? currentErrorsToShow : [];


    res.locals.informationItems = [];
    try {
        const items = await getActiveInformationItems();
        if (Array.isArray(items)) {
            res.locals.informationItems = items;
        }
    } catch (infoError) {
        console.error("Error fetching information items for locals:", infoError.message);
    }

    if (typeof res.locals.pageTitle === 'undefined') {
        res.locals.pageTitle = res.locals.storeName;
    }
    next();
});

app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/user/dashboard');
    }
    res.render('landing', { pageTitle: 'Selamat Datang' });
});

app.use('/', authRoutes);
app.use('/', storeRoutes);
app.use('/user', isAuthenticated, userRoutes);
app.use('/admin', isAuthenticated, isAdmin, adminRoutes);
app.use('/', ppobRoutes);
app.use('/pterodactyl', isAuthenticated, pterodactylRoutes);
app.use('/digitalocean', isAuthenticated, digitalOceanRoutes);
app.use('/docs', docsRoutes);
app.use('/layanan/transfer', isAuthenticated, ewalletTransferRoutes);
app.use('/api/layanan', isAuthenticated, ewalletTransferRoutes);
app.use('/user', isAuthenticated, withdrawalRoutes);
app.use('/', promotionRoutes);
app.use('/seller', isAuthenticated, isSellerApproved, sellerRoutes);
app.use('/api/midtrans', midtransRoutes);

app.get('/chat', isAuthenticated, (req, res) => {
    res.render('chat', {
        pageTitle: 'Live Chat Support',
    });
});

app.get('/user/dashboard', isAuthenticated, async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            req.flash('error_messages', 'Sesi tidak valid. Silakan login kembali.');
            return res.redirect('/login');
        }
        const user = await User.findById(req.user._id);
        if (!user) {
            req.flash('error_messages', 'User tidak ditemukan.');
            return res.redirect('/logout');
        }
        const orders = await Order.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('product', 'name');
        const deposits = await Deposit.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(5);
        const withdrawals = await Withdrawal.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(5);
        res.render('user/dashboard', {
            pageTitle: 'User Dashboard',
            user: user,
            orders: orders,
            deposits: deposits,
            withdrawals: withdrawals
        });
    } catch (err) {
        console.error("Error fetching user dashboard data:", err);
        req.flash('error_messages', 'Terjadi kesalahan saat memuat dashboard.');
        res.redirect('/');
    }
});

app.get('/admin/chat/history/:userId', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
             return res.status(400).json({ success: false, message: 'User ID tidak valid.' });
        }
        const messages = await ChatMessage.find({
            $or: [{ sender: userId, receiver: 'admin' }, { sender: 'admin', receiver: userId }]
        })
        .sort({ timestamp: 1 })
        .limit(100);

        const targetUserForName = activeUserChats[userId.toString()] || await User.findById(userId).select('username').lean();
        const usernameForChat = targetUserForName ? targetUserForName.username : `User ${userId.slice(-4)}`;

        const formattedMessages = messages.map(msg => {
            let senderNameDisplay = 'Unknown';
            let senderType = 'unknown';

            if (msg.sender && msg.sender.toString() === 'admin') {
                senderNameDisplay = `Admin ${storeNameGlobal}`;
                senderType = 'admin';
            } else if (msg.sender && msg.sender.toString() === userId.toString()){
                senderNameDisplay = usernameForChat;
                senderType = 'user';
            }
            return {
                _id: msg._id.toString(),
                text: msg.text,
                timestamp: msg.timestamp,
                sender: msg.sender.toString(),
                senderName: senderNameDisplay,
                receiver: msg.receiver.toString(),
                senderType: senderType
            };
        });
        res.json({ success: true, userId: userId, messages: formattedMessages });
    } catch (err) {
        console.error("Error fetching chat history for admin:", err);
        res.status(500).json({ success: false, message: 'Gagal mengambil riwayat chat.' });
    }
});

let adminSockets = {};
let userSockets = {};
let activeUserChats = {};

io.on('connection', (socket) => {
    const session = socket.request.session;
    const user = session?.user;

    if (user) {
        socket.join(user._id.toString());
        userSockets[user._id.toString()] = socket.id;
        if (user.role === 'admin') {
            socket.join('admin_room');
            adminSockets[user._id.toString()] = socket.id;
            socket.emit('initial_user_list_for_admin', activeUserChats);
        } else {
            if (!activeUserChats[user._id.toString()]) {
                 activeUserChats[user._id.toString()] = {
                    username: user.username,
                    unread: 0,
                    lastMessagePreview: 'Baru terhubung'
                };
            }
            io.to('admin_room').emit('user_activity_update', { userId: user._id.toString(), username: user.username, status: 'online', ...activeUserChats[user._id.toString()] });
        }
    }

    socket.on('admin_join', () => {
        if (user && user.role === 'admin') {
            if (!adminSockets[user._id.toString()]) {
                adminSockets[user._id.toString()] = socket.id;
                socket.join('admin_room');
            }
            socket.emit('initial_user_list_for_admin', activeUserChats);
        }
    });

    socket.on('chat_message', async (data) => {
        const senderUser = socket.request.session?.user;
        if (!senderUser) {
            return;
        }
        const messageText = data.text ? data.text.trim() : '';
        if (!messageText) return;

        try {
            const newMessage = new ChatMessage({
                text: messageText,
                sender: senderUser._id,
                receiver: 'admin',
                timestamp: new Date(),
            });
            const savedMessage = await newMessage.save();

            const messageToSend = {
                _id: savedMessage._id.toString(),
                text: savedMessage.text,
                sender: savedMessage.sender.toString(),
                senderName: senderUser.username,
                timestamp: savedMessage.timestamp,
                receiver: 'admin'
            };
            
            if(!activeUserChats[senderUser._id.toString()]){
                 activeUserChats[senderUser._id.toString()] = { username: senderUser.username, unread: 0, lastMessagePreview: ''};
            }
            activeUserChats[senderUser._id.toString()].unread = (activeUserChats[senderUser._id.toString()].unread || 0) + 1;
            activeUserChats[senderUser._id.toString()].lastMessagePreview = messageText.substring(0, 30) + (messageText.length > 30 ? '...' : '');
            
            io.to('admin_room').emit('new_user_message_to_admin', { ...messageToSend, ...activeUserChats[senderUser._id.toString()] });
            
            socket.emit('chat_message', messageToSend);

        } catch (err) {
            console.error(`Error saving chat message from ${senderUser.username}:`, err);
        }
    });
    
    socket.on('admin_reply_to_user', async (data) => {
        const adminUser = socket.request.session?.user;
        if (!adminUser || adminUser.role !== 'admin') {
            return;
        }
        const messageText = data.text ? data.text.trim() : '';
        const targetUserId = data.receiver;
        if (!messageText || !targetUserId) return;

        try {
            const newMessage = new ChatMessage({
                text: messageText,
                sender: 'admin',
                receiver: targetUserId,
                timestamp: new Date(),
            });
            const savedMessage = await newMessage.save();

            const messageToUser = {
                _id: savedMessage._id.toString(),
                text: savedMessage.text,
                sender: 'admin',
                senderName: `Admin ${storeNameGlobal}`,
                timestamp: savedMessage.timestamp,
                receiver: targetUserId
            };

            io.to(targetUserId.toString()).emit('chat_message', messageToUser);
            socket.emit('admin_message_sent_confirmation', messageToUser); 
            
            if (activeUserChats[targetUserId.toString()]) {
                 activeUserChats[targetUserId.toString()].lastMessagePreview = "Admin: " + messageText.substring(0, 25) + (messageText.length > 25 ? '...' : '');
                 activeUserChats[targetUserId.toString()].unread = 0;
                 io.to('admin_room').emit('user_activity_update', { userId: targetUserId.toString(), ...activeUserChats[targetUserId.toString()] });
            }
        } catch (err) {
            console.error(`Error saving admin reply to ${targetUserId}:`, err);
        }
    });

    socket.on('load_chat_history_for_admin', async ({ userId }) => {
        const adminUser = socket.request.session?.user;
        if (!adminUser || adminUser.role !== 'admin' || !userId) {
            return;
        }
        try {
            const messages = await ChatMessage.find({
                $or: [{ sender: userId, receiver: 'admin' }, { sender: 'admin', receiver: userId }]
            }).sort({ timestamp: 1 }).limit(100);
            
            const targetUserForName = activeUserChats[userId.toString()] || await User.findById(userId).select('username').lean();
            const usernameForChat = targetUserForName ? targetUserForName.username : `User ${userId.slice(-4)}`;

            const formattedMessages = messages.map(msg => ({
                _id: msg._id.toString(),
                text: msg.text,
                timestamp: msg.timestamp,
                sender: msg.sender.toString(),
                senderType: msg.sender.toString() === userId.toString() ? 'user' : 'admin',
                senderName: msg.sender.toString() === userId.toString() ? usernameForChat : `Admin ${storeNameGlobal}`
            }));

            socket.emit('chat_history_for_admin', { userId, messages: formattedMessages });
            
            if(activeUserChats[userId.toString()]){
                activeUserChats[userId.toString()].unread = 0;
                io.to('admin_room').emit('user_activity_update', { userId: userId.toString(), ...activeUserChats[userId.toString()] });
            }
        } catch (err) {
            console.error(`Error fetching chat history for admin (user ${userId}):`, err);
        }
    });

    socket.on('user_join', (data) => {
        if (data.userId && socket.request.session?.user?._id.toString() === data.userId.toString()) {
            socket.join(data.userId.toString());
            if (!userSockets[data.userId.toString()]) {
                userSockets[data.userId.toString()] = socket.id;
            }
            if(socket.request.session?.user){
                if (!activeUserChats[data.userId.toString()]) {
                    activeUserChats[data.userId.toString()] = {
                        username: socket.request.session.user.username,
                        unread: 0,
                        lastMessagePreview: 'Baru terhubung'
                    };
                }
                io.to('admin_room').emit('user_activity_update', { userId: data.userId, username: socket.request.session.user.username, status: 'online', ...activeUserChats[data.userId.toString()] });
            }
        }
    });

    socket.on('load_history', async ({ userId }) => {
        if (!userId || !socket.request.session?.user || socket.request.session.user._id.toString() !== userId.toString()) {
            return socket.emit('chat_history', []);
        }
        try {
            const messages = await ChatMessage.find({
                 $or: [{ sender: userId, receiver: 'admin' }, { sender: 'admin', receiver: userId }]
            }).sort({ timestamp: 1 }).limit(50);

            const formattedMessages = messages.map(msg => ({
                _id: msg._id.toString(),
                text: msg.text,
                timestamp: msg.timestamp,
                sender: msg.sender.toString(),
                senderName: msg.sender.toString() === userId.toString() ? socket.request.session.user.username : `Admin ${storeNameGlobal}`,
                senderType: msg.sender.toString() === userId.toString() ? 'user' : 'admin'
            }));
            socket.emit('chat_history', formattedMessages);
        } catch (error) {
            console.error(`Error loading chat history for user ${userId}:`, error);
            socket.emit('chat_history', []);
        }
    });

    socket.on('disconnect', () => {
        if (user) {
            delete userSockets[user._id.toString()];
            if (user.role === 'admin') {
                delete adminSockets[user._id.toString()];
            } else {
                 io.to('admin_room').emit('user_activity_update', { userId: user._id.toString(), username: user.username, status: 'offline' });
            }
        }
    });

    socket.on('adminPostInfo', async (infoData, ack) => {
        const adminUser = socket.request.session?.user;
        if (adminUser && adminUser.role === 'admin') {
            const newInfoItem = { 
                _id: new mongoose.Types.ObjectId(),
                title: infoData.title,
                content: infoData.content,
                type: infoData.type || 'info',
                createdBy: { username: adminUser.username, _id: adminUser._id },
                isActive: true,
                createdAt: new Date()
            };
            io.emit('newInfoBoardUpdate', newInfoItem);
            if (typeof ack === 'function') ack({ success: true, message: "Informasi berhasil dibroadcast."});
        } else {
            if (typeof ack === 'function') ack({ success: false, message: "Aksi tidak diotorisasi."});
        }
    });
});

app.use((req, res, next) => {
    res.status(404).render('errors/404', {
        url: req.originalUrl
    });
});

app.use((err, req, res, next) => {
    console.error("GLOBAL ERROR HANDLER:", req.originalUrl, err.message);
    if (err.stack) console.error(err.stack.substring(0,500));
    
    const statusCode = err.statusCode || 500;
    let errMessageForClient = 'Terjadi kesalahan internal pada server.';
    if (process.env.NODE_ENV !== 'production') {
        errMessageForClient = err.message || errMessageForClient;
    }
    
    res.locals.pageTitle = `${statusCode} Kesalahan Server`;
    res.status(statusCode).render('errors/500', {
        error: process.env.NODE_ENV !== 'production' ? err : { message: "Terjadi kesalahan pada server." },
        messageFromServer: errMessageForClient
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT} - Mode: ${process.env.NODE_ENV || 'development'}`);
});