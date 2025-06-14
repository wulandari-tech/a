const mongoose = require('mongoose');

const informationBoardItemSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['info', 'warning', 'promo', 'maintenance'],
        default: 'info'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    }
}, { timestamps: true });

const InformationBoardItem = mongoose.model('InformationBoardItem', informationBoardItemSchema);

module.exports = InformationBoardItem;