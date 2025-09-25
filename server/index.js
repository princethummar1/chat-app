const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Message = require('./Message');
const User = require('./User');
const Conversation = require('./Conversation');

const app = express();
// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use(express.json()); // This is crucial!
app.use(cors()); // Enable CORS for all routes
app.use('/uploads', express.static(uploadsDir));
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // The origin of our React app
    methods: ["GET", "POST"],
  },
});

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/mern-chat', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};
connectDB()

app.use('/api/auth', require('./authRoutes'));
app.use('/api/conversations', require('./conversationRoutes'));
app.use('/api/users', require('./userRoutes'));

// Multer storage for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Re-ensure directory exists at runtime
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage });

// Image upload endpoint
app.post('/api/upload/image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

app.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: 'asc' });
    res.json(messages);
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// Get messages between two users (for legacy client usage)
app.get('/messages/:userId1/:userId2', async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;

    // Find conversation containing exactly these two participants
    let conversation = await Conversation.findOne({
      participants: { $all: [userId1, userId2] }
    });

    if (!conversation) {
      return res.json([]);
    }

    const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 'asc' });
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

const onlineUsers = new Map(); // userId -> socket.id
const userSockets = new Map(); // userId -> socket.id (for reverse lookup)

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', async (userId) => {
    console.log('Registering user:', userId, 'with socket:', socket.id);
    
    // Store both mappings
    userSockets.set(userId, socket.id);
    onlineUsers.set(userId, socket.id);

    // Update user's online status and last seen
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date()
    });

    // Send the full list of online users with their status to the newly connected user
    const onlineUserIds = Array.from(onlineUsers.keys());

    // Get detailed status for all users (not just online ones)
    const allUsers = await User.find({}, '_id isOnline lastSeen');
    const userStatusMap = {};
    allUsers.forEach(user => {
      userStatusMap[user._id] = {
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      };
    });

    // Send complete status info to the newly connected user
    socket.emit('initialStatusData', userStatusMap);

    // Broadcast updated online users to all other clients
    io.emit('updateUserList', onlineUserIds);

    // Emit user status update to everyone
    io.emit('userStatusUpdate', {
      userId,
      isOnline: true,
      lastSeen: new Date()
    });
  });

  // Add this new event handler to send initial status data on request
  socket.on('requestInitialStatus', async () => {
    try {
      const allUsers = await User.find({}, '_id isOnline lastSeen');
      const userStatusMap = {};
      allUsers.forEach(user => {
        userStatusMap[user._id] = {
          isOnline: user.isOnline,
          lastSeen: user.lastSeen
        };
      });
      socket.emit('initialStatusData', userStatusMap);
    } catch (error) {
      console.error('Error sending initial status:', error);
    }
  });

  // Heartbeat to refresh lastSeen without re-login
  socket.on('heartbeat', async (userId) => {
    try {
      await User.findByIdAndUpdate(userId, { lastSeen: new Date(), isOnline: true });
      io.emit('userStatusUpdate', { userId, isOnline: true, lastSeen: new Date() });
    } catch (err) {
      console.error('Error handling heartbeat:', err);
    }
  });

  // Listen for a private message (update this handler to support groups)
  socket.on('privateMessage', async ({ senderId, recipientId, text, conversationId }) => {
    try {
      let conversation;

      // If conversationId is provided, use it (for group messages)
      if (conversationId) {
        conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          console.error('Conversation not found:', conversationId);
          return;
        }

        // Verify sender is a participant
        if (!conversation.participants.includes(senderId)) {
          console.error('Sender is not a participant in this conversation');
          return;
        }

        // For group messages, recipientId is the conversationId
        recipientId = conversationId;
      } else {
        // For one-on-one chats, find or create conversation
        conversation = await Conversation.findOne({
          participants: { $all: [senderId, recipientId] },
        });

        if (!conversation) {
          conversation = new Conversation({
            participants: [senderId, recipientId],
            unreadCount: new Map()
          });
          await conversation.save();
        }
      }

      // Create and save the new message
      const message = new Message({
        conversationId: conversation._id,
        sender: senderId,
        text: text,
      });
      await message.save();

      // Update conversation with last message info
      conversation.lastMessage = message._id;
      conversation.lastMessageTime = message.createdAt;

      // Increment unread count for all recipients except sender
      for (const participantId of conversation.participants) {
        if (participantId.toString() !== senderId) {
          const currentUnreadCount = conversation.unreadCount.get(participantId.toString()) || 0;
          conversation.unreadCount.set(participantId.toString(), currentUnreadCount + 1);
        }
      }

      await conversation.save();

      // For group messages, send to all participants
      if (conversation.isGroup) {
        for (const participantId of conversation.participants) {
          if (participantId.toString() !== senderId) {
            const participantSocketId = onlineUsers.get(participantId.toString());
            if (participantSocketId) {
              io.to(participantSocketId).emit('receivePrivateMessage', {
                ...message.toObject(),
                conversationId: conversation._id,
                unreadCount: conversation.unreadCount.get(participantId.toString())
              });

              // Show popup notification
              try {
                const senderUser = await User.findById(senderId).select('username');
                io.to(participantSocketId).emit('messageNotification', {
                  senderId,
                  senderName: senderUser?.username,
                  message: text,
                  conversationId: conversation._id,
                  isGroup: true,
                  groupName: conversation.groupName
                });
              } catch (_) {
                io.to(participantSocketId).emit('messageNotification', {
                  senderId,
                  message: text,
                  conversationId: conversation._id,
                  isGroup: true,
                  groupName: conversation.groupName
                });
              }
            }
          }
        }
      } else {
        // For one-on-one chats, send only to the recipient
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('receivePrivateMessage', {
            ...message.toObject(),
            conversationId: conversation._id,
            unreadCount: conversation.unreadCount.get(recipientId)
          });

          // Show popup notification
          try {
            const senderUser = await User.findById(senderId).select('username');
            io.to(recipientSocketId).emit('messageNotification', {
              senderId,
              senderName: senderUser?.username,
              message: text,
              conversationId: conversation._id
            });
          } catch (_) {
            io.to(recipientSocketId).emit('messageNotification', {
              senderId,
              message: text,
              conversationId: conversation._id
            });
          }
        }
      }

      // Also send the message back to the sender
      socket.emit('receivePrivateMessage', {
        ...message.toObject(),
        conversationId: conversation._id,
        unreadCount: 0
      });

    } catch (error) {
      console.error('Error handling private message:', error);
    }
  });

  // Update the markAsSeen handler for groups
  socket.on('markAsSeen', async ({ conversationId, userId }) => {
    try {
      console.log(`[SERVER] Received 'markAsSeen' from user ${userId} for conversation ${conversationId}`);

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        console.log('[SERVER] Conversation not found.');
        return;
      }

      // Reset unread count for this user
      if (conversation.unreadCount.get(userId) > 0) {
        conversation.unreadCount.set(userId, 0);
        await conversation.save();
      }

      // For one-on-one chats, notify the other participant
      if (!conversation.isGroup) {
        const otherParticipant = conversation.participants.find(p => p.toString() !== userId);
        if (!otherParticipant) {
          console.log('[SERVER] Other participant not found.');
          return;
        }

        // Get the socket ID of the other participant
        const recipientSocketId = userSockets.get(otherParticipant.toString());
        console.log(`[SERVER] Found other participant: ${otherParticipant}. Socket ID: ${recipientSocketId}`);

        if (recipientSocketId) {
          console.log(`[SERVER] Emitting 'readReceiptUpdate' to socket ${recipientSocketId}`);
          io.to(recipientSocketId).emit('readReceiptUpdate', {
            conversationId,
            userId,
            seenAt: new Date(),
          });
        } else {
          console.log(`[SERVER] User ${otherParticipant} is not connected via socket.`);
        }
      }

    } catch (error) {
      console.error('[SERVER] Error in markAsSeen:', error);
    }
  });

  // Image message via socket - update to handle groups
  socket.on('privateImageMessage', async ({ senderId, recipientId, imageUrl, conversationId }) => {
    try {
      let conversation;

      // If conversationId is provided, it's a group message
      if (conversationId) {
        conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          console.error('Conversation not found:', conversationId);
          return;
        }

        // Verify sender is a participant
        if (!conversation.participants.includes(senderId)) {
          console.error('Sender is not a participant in this conversation');
          return;
        }

        // For group messages, recipientId is the conversationId
        recipientId = conversationId;
      } else {
        // For one-on-one chats, find or create conversation
        conversation = await Conversation.findOne({
          participants: { $all: [senderId, recipientId] },
        });

        if (!conversation) {
          conversation = new Conversation({
            participants: [senderId, recipientId],
            unreadCount: new Map()
          });
          await conversation.save();
        }
      }

      const message = new Message({
        conversationId: conversation._id,
        sender: senderId,
        text: '',
        imageUrl,
      });
      await message.save();

      conversation.lastMessage = message._id;
      conversation.lastMessageTime = message.createdAt;

      // For group messages, increment unread count for all participants except sender
      if (conversation.isGroup) {
        for (const participantId of conversation.participants) {
          if (participantId.toString() !== senderId) {
            const currentUnreadCount = conversation.unreadCount.get(participantId.toString()) || 0;
            conversation.unreadCount.set(participantId.toString(), currentUnreadCount + 1);
          }
        }
      } else {
        // For one-on-one, increment only for the recipient
        const currentUnreadCount = conversation.unreadCount.get(recipientId) || 0;
        conversation.unreadCount.set(recipientId, currentUnreadCount + 1);
      }

      await conversation.save();

      // For group messages, send to all participants
      if (conversation.isGroup) {
        for (const participantId of conversation.participants) {
          if (participantId.toString() !== senderId) {
            const participantSocketId = onlineUsers.get(participantId.toString());
            if (participantSocketId) {
              io.to(participantSocketId).emit('receivePrivateMessage', {
                ...message.toObject(),
                conversationId: conversation._id,
                unreadCount: conversation.unreadCount.get(participantId.toString())
              });
            }
          }
        }
      } else {
        // For one-on-one, send only to recipient
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('receivePrivateMessage', {
            ...message.toObject(),
            conversationId: conversation._id,
            unreadCount: conversation.unreadCount.get(recipientId)
          });
        }
      }

      // Always send back to sender
      socket.emit('receivePrivateMessage', {
        ...message.toObject(),
        conversationId: conversation._id,
        unreadCount: 0
      });
    } catch (error) {
      console.error('Error handling image message:', error);
    }
  });

  // Remove this entire handler or modify it to use the same logic as privateMessage
  socket.on('sendGroupMessage', async (data) => {
    // This can be removed since we're handling group messages in privateMessage
  });

  // Similar handler for group images
  socket.on('sendGroupImage', async (data) => {
    // Similar logic but for image messages
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find which user was associated with this socket
    let disconnectedUserId = null;
    for (let [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        userSockets.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      console.log('Disconnected user ID:', disconnectedUserId);
      
      // Delay marking as offline to handle quick refreshes
      setTimeout(async () => {
        // Check if the user has reconnected with a new socket ID
        // If they have, onlineUsers.get(disconnectedUserId) will be a *different* socket.id
        // If they haven't reconnected, the entry will still be our current socket.id, or it will have been deleted.
        // For simplicity, we just check if they are still mapped to this socket.id.
        if (onlineUsers.get(disconnectedUserId) === socket.id) {
          onlineUsers.delete(disconnectedUserId);
        }

        // We only mark them as offline if they are TRULY gone (no other sessions open)
        if (!onlineUsers.has(disconnectedUserId)) {
          try {
            console.log('Marking user as offline:', disconnectedUserId);
            await User.findByIdAndUpdate(disconnectedUserId, {
              isOnline: false,
              lastSeen: new Date()
            });

            // Broadcast the status update to all clients
            io.emit('userStatusUpdate', {
              userId: disconnectedUserId,
              isOnline: false,
              lastSeen: new Date()
            });

            // Broadcast the new list of online user IDs
            io.emit('updateUserList', Array.from(onlineUsers.keys()));
          } catch (err) {
            console.error('Error updating user status on disconnect:', err);
          }
        } else {
          console.log('User reconnected with different socket, not marking as offline');
        }
      }, 5000); // 5-second delay
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});