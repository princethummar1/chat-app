const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Update the conversation's lastMessage when a new message is saved
messageSchema.post('save', async function() {
  try {
    await mongoose.model('Conversation').findByIdAndUpdate(
      this.conversationId,
      { 
        lastMessage: this._id, 
        lastMessageTime: this.createdAt 
      }
    );
  } catch (error) {
    console.error('Error updating conversation last message:', error);
  }
});

module.exports = mongoose.model('Message', messageSchema);