// models/Information.js
const mongoose = require('mongoose');

const informationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    type: { // 'info', 'warning', 'promo', 'maintenance'
        type: String,
        default: 'info',
        enum: ['info', 'warning', 'promo', 'maintenance']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Referensi ke model User jika Anda ingin melacak siapa yang membuat
    }
}, { timestamps: true });

module.exports = mongoose.model('Information', informationSchema);