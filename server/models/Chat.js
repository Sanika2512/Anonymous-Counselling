const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    counselor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    studentAnonymousId: {
        type: String
    },

    messages: [
        {
            sender: {
                type: String,
                enum: ['student', 'counselor']
            },
            senderId: {  // ✅ ADD THIS - to track who sent the message
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            text: {
                type: String
            },
            timestamp: {
                type: Date,
                default: Date.now
            },
            readBy: [{ 
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }],
               edited: { type: Boolean, default: false },
               deletedForAll: { type: Boolean, default: false },
               deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
                 replyTo: {
                 messageId: { type: mongoose.Schema.Types.ObjectId },
               text: { type: String }  
     }
             
        }

],
    status: {  
        type: String,
        enum: ['active', 'closed'],
        default: 'active'
    },
    lastMessage: {  
        text: String,
        timestamp: Date,
        sender: String
    },
    unreadCount: {  
        student: { type: Number, default: 0 },
        counselor: { type: Number, default: 0 }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {  // ✅ ADD THIS - to sort by recent activity
        type: Date,
        default: Date.now
    }
});
chatSchema.pre('save', function () {
    this.updatedAt = new Date();
});

module.exports = mongoose.model('Chat', chatSchema);