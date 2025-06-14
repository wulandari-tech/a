const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    },
    productNameSnapshot: {
        type: String,
        required: true
    },
    productCodeSnapshot: {
        type: String 
    },
    productType: {
        type: String,
        required: true,
        enum: ['physical_virtual', 'game_topup', 'ppob_generic', 'prabayar', 'pascabayar', 'sosmed', 'transfer_fund']
    },
    quantity: {
        type: Number,
        default: 1
    },
    pricePerItem: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    paymentMethodType: {
        type: String,
        required: true,
        enum: ['balance', 'orkut_qris', 'midtrans_gateway']
    },
    status: {
        type: String,
        enum: [
            'pending_payment', 'paid_with_balance', 'paid_with_gateway', 
            'processing_pterodactyl', 'pterodactyl_setup_failed', 'processing_vps', 'vps_setup_failed',
            'processing_game_topup', 'game_topup_failed', 
            'processing_provider', 'provider_failed',
            'processing_transfer', 'transfer_failed',
            'completed', 'failed', 'refunded', 'payment_failed', 'pending_review'
        ],
        default: 'pending_payment'
    },
    reffId: {
        type: String,
        required: true,
        unique: true
    },
    paymentGatewayDetails: {
        gateway: String,
        orkutReffId: String,
        qrImageUrl: String,
        amountToPay: Number,
        fee: Number,
        expiredAt: Date,
        statusMessage: String,
        rawResponse: mongoose.Schema.Types.Mixed,
        midtransToken: String,
        midtransOrderId: String,
        paymentUrl: String,
        midtransNotificationRaw: mongoose.Schema.Types.Mixed
    },
    providerTransactionId: String,
    providerTransactionDetails: mongoose.Schema.Types.Mixed,
    lastCheckedPaymentAt: Date,
    paidAt: Date,
    appPremiumDelivery: {
        deliveredItems: [String]
    },
    pterodactylOrderDetails: {
        panelUsername: String,
        panelPasswordHashed: String, 
        pterodactylUserId: Number,
        pterodactylServerId: Number,
        statusMessage: String,
        serverDetails: mongoose.Schema.Types.Mixed 
    },
    digitalOceanVpsOrderDetails: {
        hostname: String,
        dropletId: Number,
        ipAddress: String,
        statusMessage: String,
        rootPasswordEncrypted: String 
    },
    gameOrderDetails: {
        gameUserId: String,
        gameZoneId: String,
        statusMessage: String,
        forestApiTrxId: String, 
    },
    requimeboostOrderDetails: {
        target: String,
        zoneId: String,
        providerOrderId: String,
        serverSMM: String,
    },
    providerResponse: {
        type: mongoose.Schema.Types.Mixed
    },
    adminNotes: String
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'paymentGatewayDetails.orkutReffId': 1 });
orderSchema.index({ 'paymentGatewayDetails.midtransOrderId': 1 });


const Order = mongoose.model('Order', orderSchema);

module.exports = Order;