const Deposit = require('../models/deposit');
const Order = require('../models/order');
const User = require('../models/user');
const Product = require('../models/product');
const crypto = require('crypto');

exports.createDepositTransaction = async (req, res) => {
    const { depositId } = req.params;
    const snap = req.app.get('midtransSnap');
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;

    try {
        const deposit = await Deposit.findById(depositId).populate('user');
        if (!deposit || deposit.user._id.toString() !== req.session.user._id.toString() || deposit.status !== 'pending' || deposit.paymentGateway !== 'MIDTRANS') {
            return res.status(404).json({ success: false, message: 'Deposit Midtrans tidak valid atau sudah diproses.' });
        }

        let parameter = {
            transaction_details: {
                order_id: deposit.reffId + '-' + crypto.randomBytes(3).toString('hex'),
                gross_amount: deposit.totalPaid 
            },
            customer_details: {
                first_name: deposit.user.username,
                email: deposit.user.email,
            },
            item_details: [{
                id: deposit._id.toString(),
                price: deposit.totalPaid,
                quantity: 1,
                name: `Deposit Saldo ${process.env.STORE_NAME} - ${deposit.reffId}`
            }],
            callbacks: {
                finish: `${req.protocol}://${req.get('host')}/user/deposit/status/${deposit._id}`
            }
        };

        const token = await snap.createTransactionToken(parameter);
        deposit.providerTransactionId = parameter.transaction_details.order_id; 
        deposit.paymentUrl = `https://${snap.isProduction ? 'app' : 'app.sandbox'}.midtrans.com/snap/v2/vtweb/${token}`;
        await deposit.save();

        res.json({ success: true, token: token });

    } catch (error) {
        console.error('Midtrans create deposit transaction error:', error);
        let errorMessage = 'Gagal membuat transaksi Midtrans.';
        if (error.ApiResponse && error.ApiResponse.error_messages) {
            errorMessage += ` Pesan: ${error.ApiResponse.error_messages.join(', ')}`;
        }
        res.status(500).json({ success: false, message: errorMessage });
    }
};

exports.createOrderTransaction = async (req, res) => {
    const { orderId } = req.params;
    const snap = req.app.get('midtransSnap');

    try {
        const order = await Order.findById(orderId).populate('user').populate('product');
        if (!order || order.user._id.toString() !== req.session.user._id.toString() || order.status !== 'pending_payment' || order.paymentMethodType !== 'midtrans_gateway') {
            return res.status(404).json({ success: false, message: 'Order Midtrans tidak valid atau sudah diproses.' });
        }

        let parameter = {
            transaction_details: {
                order_id: order.reffId + '-' + crypto.randomBytes(3).toString('hex'),
                gross_amount: order.totalPrice
            },
            customer_details: {
                first_name: order.user.username,
                email: order.user.email,
            },
            item_details: [{
                id: order.product._id.toString(),
                price: order.pricePerItem,
                quantity: order.quantity,
                name: order.productNameSnapshot.substring(0, 50)
            }],
            callbacks: {
                finish: `${req.protocol}://${req.get('host')}/order/${order._id}/confirmation`
            }
        };
        
        const token = await snap.createTransactionToken(parameter);
        order.paymentGatewayDetails.midtransToken = token;
        order.paymentGatewayDetails.midtransOrderId = parameter.transaction_details.order_id;
        order.paymentGatewayDetails.paymentUrl = `https://${snap.isProduction ? 'app' : 'app.sandbox'}.midtrans.com/snap/v2/vtweb/${token}`;
        await order.save();

        res.json({ success: true, token: token });

    } catch (error) {
        console.error('Midtrans create order transaction error:', error);
        let errorMessage = 'Gagal membuat transaksi Midtrans untuk order.';
        if (error.ApiResponse && error.ApiResponse.error_messages) {
            errorMessage += ` Pesan: ${error.ApiResponse.error_messages.join(', ')}`;
        }
        res.status(500).json({ success: false, message: errorMessage });
    }
};


exports.handleNotification = async (req, res) => {
    const notificationJson = req.body;
    const snap = req.app.get('midtransSnap');
    const telegramBot = req.app.get('telegramBot');
    const ownerChatId = process.env.TELEGRAM_OWNER_ID;
    const io = req.app.get('io');

    try {
        const statusResponse = await snap.transaction.notification(notificationJson);
        let midtrans_order_id = statusResponse.order_id;
        let transaction_status = statusResponse.transaction_status;
        let fraud_status = statusResponse.fraud_status;
        let payment_type = statusResponse.payment_type;

        console.log(`Midtrans Notification for order_id: ${midtrans_order_id}, transaction_status: ${transaction_status}, fraud_status: ${fraud_status}, payment_type: ${payment_type}`);
        
        const deposit = await Deposit.findOne({ providerTransactionId: midtrans_order_id }).populate('user', 'username email');
        const order = await Order.findOne({ 'paymentGatewayDetails.midtransOrderId': midtrans_order_id }).populate('user', 'username email').populate('product');

        let targetDocument = deposit || order;
        let docType = deposit ? 'deposit' : (order ? 'order' : null);

        if (!targetDocument) {
            console.warn(`Transaksi Midtrans dengan ID ${midtrans_order_id} tidak ditemukan di database (Deposit atau Order).`);
            return res.status(404).send('Transaction not found in local DB');
        }

        if (targetDocument.status === 'success' || targetDocument.status === 'completed') {
            console.log(`Transaksi ${docType} ${targetDocument.reffId} sudah sukses sebelumnya. Abaikan notifikasi Midtrans.`);
            return res.status(200).send('OK');
        }

        let updateData = {};
        let newStatus = targetDocument.status;
        let balanceUpdatedThisNotification = false;
        let statusMessageForUser = '';
        let userToNotify = targetDocument.user;

        if (transaction_status == 'capture' || transaction_status == 'settlement') {
            if (fraud_status == 'accept') {
                newStatus = (docType === 'deposit') ? 'success' : ( (targetDocument.product && ['pterodactyl_panel', 'vps'].includes(targetDocument.product.category)) ? `processing_${targetDocument.product.category.replace('_panel','').replace('_','')}` : 'completed');
                statusMessageForUser = `Pembayaran ${docType} Anda berhasil!`;
            } else if (fraud_status == 'challenge') {
                newStatus = 'pending_review'; 
                statusMessageForUser = `Pembayaran ${docType} Anda sedang direview.`;
            } else {
                newStatus = 'failed';
                statusMessageForUser = `Pembayaran ${docType} Anda gagal karena fraud.`;
            }
        } else if (transaction_status == 'cancel' || transaction_status == 'deny' || transaction_status == 'expire') {
            newStatus = (docType === 'deposit') ? 'failed' : 'payment_failed';
            statusMessageForUser = `Pembayaran ${docType} Anda ${transaction_status}.`;
        } else if (transaction_status == 'pending') {
            newStatus = (docType === 'deposit') ? 'pending' : 'pending_payment';
            statusMessageForUser = `Pembayaran ${docType} Anda masih pending.`;
        }
        
        targetDocument.status = newStatus;
        if(docType === 'order') {
            targetDocument.paymentGatewayDetails.midtransNotificationRaw = statusResponse;
            targetDocument.paymentGatewayDetails.statusMessage = `Midtrans: ${transaction_status}`;
            if(newStatus.startsWith('processing_') || newStatus === 'completed') targetDocument.paidAt = new Date();
        } else if (docType === 'deposit') {
            targetDocument.midtransNotificationRaw = statusResponse; 
        }


        if (newStatus === 'success' && docType === 'deposit' && !targetDocument.balanceUpdated) {
            const user = await User.findById(targetDocument.user._id);
            if (user) {
                user.balance = (user.balance || 0) + targetDocument.getBalance;
                await user.save();
                targetDocument.balanceUpdated = true;
                balanceUpdatedThisNotification = true;
                statusMessageForUser += ` Saldo Rp ${targetDocument.getBalance.toLocaleString('id-ID')} telah ditambahkan.`;

                if (req.session && req.session.user && req.session.user._id.toString() === user._id.toString()) {
                    req.session.user.balance = user.balance;
                    req.session.save();
                }
                
                if (telegramBot && ownerChatId) {
                    const notifMessage = `💰 *DEPOSIT MIDTRANS SUKSES* 💰\n\nPengguna: *${user.username}*\nJumlah Terima: *Rp ${targetDocument.getBalance.toLocaleString('id-ID')}*\nMetode: *${targetDocument.method}*\nRef ID: \`${targetDocument.reffId}\`\nMidtrans ID: \`${midtrans_order_id}\`\n\nSaldo pengguna telah diperbarui.`;
                    try { await telegramBot.sendMessage(ownerChatId, notifMessage, { parse_mode: 'Markdown' }); } catch (e) {}
                }
            } else {
                 targetDocument.status = 'failed'; 
                 statusMessageForUser = `Pembayaran ${docType} terkonfirmasi tapi user tidak ditemukan.`;
            }
        } else if ((newStatus.startsWith('processing_') || newStatus === 'completed') && docType === 'order' && targetDocument.productType === 'physical_virtual') {
            const product = await Product.findById(targetDocument.product._id);
            if (product) {
                if (product.category === 'app_premium' && product.appPremiumDetails && product.appPremiumDetails.vccInfo) {
                    const allAccounts = product.appPremiumDetails.vccInfo.split('\n').map(line => line.trim()).filter(line => line);
                    if (allAccounts.length < targetDocument.quantity) {
                        targetDocument.status = 'payment_failed';
                        targetDocument.paymentGatewayDetails.statusMessage += ' Stok produk habis setelah pembayaran. Refund diperlukan.';
                        statusMessageForUser = 'Pembayaran berhasil tapi stok produk habis. Hubungi admin untuk refund.';
                    } else {
                        const accountsToDeliverForOrder = allAccounts.slice(0, targetDocument.quantity);
                        targetDocument.appPremiumDelivery = { deliveredItems: accountsToDeliverForOrder };
                        if (product.stock !== -1) {
                            const remainingAccounts = allAccounts.slice(targetDocument.quantity);
                            product.appPremiumDetails.vccInfo = remainingAccounts.join('\n');
                            product.stock = remainingAccounts.length;
                            await product.save();
                        }
                        targetDocument.status = 'completed'; // Langsung completed jika app_premium dan stok ada
                        statusMessageForUser = 'Pembelian produk premium berhasil, detail akan dikirimkan.';
                    }
                } else if (product.stock !== -1 && product.stock < targetDocument.quantity) {
                     targetDocument.status = 'payment_failed';
                     targetDocument.paymentGatewayDetails.statusMessage += ' Stok produk habis setelah pembayaran. Refund diperlukan.';
                     statusMessageForUser = 'Pembayaran berhasil tapi stok produk habis. Hubungi admin untuk refund.';
                } else if (product.stock !== -1) {
                    product.stock -= targetDocument.quantity;
                    await product.save();
                }
            }
             if (telegramBot && ownerChatId) {
                const notifMessage = `🛍️ *ORDER TOKO MIDTRANS ${newStatus.toUpperCase()}* 🛍️\n\nPengguna: *${userToNotify.username}*\nProduk: *${targetDocument.productNameSnapshot}*\nRef ID: \`${targetDocument.reffId}\`\nMidtrans ID: \`${midtrans_order_id}\`\nStatus: *${newStatus}*`;
                try { await telegramBot.sendMessage(ownerChatId, notifMessage, { parse_mode: 'Markdown' }); } catch (e) {}
            }
        }
    
        await targetDocument.save();
    
        if(io && userToNotify) {
            io.to(userToNotify._id.toString()).emit(`${docType}_status_update`, {
                docId: targetDocument._id.toString(),
                status: newStatus,
                message: statusMessageForUser
            });
        }
    
        res.status(200).send('OK');

    } catch (error) {
        console.error('Midtrans notification handler error:', error);
        let errorMessage = "Error handling Midtrans notification.";
        if (error.ApiResponse && error.ApiResponse.status_message) {
             errorMessage += ` Midtrans Msg: ${error.ApiResponse.status_message}`;
        }
        res.status(500).send(errorMessage);
    }
};