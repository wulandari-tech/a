const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reffId: {
        type: String,
        required: true,
        unique: true
    },
    providerTransactionId: String,
    method: {
        type: String,
        required: true
    },
    methodCode: {
        type: String,
        required: true
    },
    paymentGateway: {
        type: String,
        enum: ['ORKUT_QRIS_DYNAMIC', 'FORESTAPI', 'MIDTRANS', 'MANUAL'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    fee: {
        type: Number,
        default: 0
    },
    getBalance: {
        type: Number,
        required: true
    },
    totalPaid: {
        type: Number 
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed', 'expired', 'pending_review'],
        default: 'pending'
    },
    qrImageUrl: String,
    paymentUrl: String, 
    expiredAt: Date,
    balanceUpdated: {
        type: Boolean,
        default: false
    },
    lastCheckedAt: Date,
    adminNotes: String,
    providerTransactionDetails: mongoose.Schema.Types.Mixed, 
    midtransNotificationRaw: mongoose.Schema.Types.Mixed 
}, { timestamps: true });

depositSchema.index({ user: 1, createdAt: -1 });
depositSchema.index({ providerTransactionId: 1 });


const Deposit = mongoose.model('Deposit', depositSchema);

module.exports = Deposit;