const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        trim: true
    },
    sender: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'User',
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    readByAdmin: {
        type: Boolean,
        default: false
    },
    readByUser: {
        type: Boolean,
        default: false
    }
});

chatMessageSchema.index({ sender: 1, receiver: 1, timestamp: -1 });
chatMessageSchema.index({ receiver: 1, readByAdmin: 1, timestamp: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);