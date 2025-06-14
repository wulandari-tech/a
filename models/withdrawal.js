const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 30000
    },
    method: {
        type: String,
        required: true
    },
    accountNumber: {
        type: String,
        required: true
    },
    accountHolderName: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed', 'failed'],
        default: 'pending'
    },
    adminNotes: {
        type: String
    },
    transactionId: {
        type: String
    },
    fee: {
        type: Number,
        default: 0
    },
    amountAfterFee: {
        type: Number
    }
}, { timestamps: true });

withdrawalSchema.pre('save', function(next) {
    if (this.isModified('amount') || this.isModified('fee') || this.isNew) {
        this.amountAfterFee = this.amount - this.fee;
    }
    next();
});


const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
module.exports = Withdrawal;