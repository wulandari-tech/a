
const mongoose = require('mongoose');
const informationBoardSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    type: { 
        type: String,
        default: 'info',
        enum: ['info', 'warning', 'promo', 'maintenance']
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' 
    }
}, { timestamps: true });

module.exports = mongoose.model('InformationBoard', informationBoardSchema);