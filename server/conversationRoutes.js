const express = require('express');
const router = express.Router();
const auth = require('./authMiddelware'); // Assuming this adds user to req.user
const Conversation = require('./Conversation');
const Message = require('./Message');
const User = require('./User'); // You'll need the User model

// --- ROUTE 1: Get all of a user's conversations with unread counts ---
router.get('/', auth, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        // 1. Fetch the current user to get their 'lastSeen' map
        const currentUser = await User.findById(currentUserId);

        // 2. Fetch all conversations for the user
        const conversations = await Conversation.find({
            participants: currentUserId
        })
        .populate('participants', 'username')
        .lean(); // Use .lean() for better performance as we're modifying the objects

        // 3. For each conversation, calculate the unread count
        const conversationsWithCounts = conversations.map(convo => {
            // Get unread count from the conversation's unreadCount map
            const unreadCount = convo.unreadCount?.get?.(currentUserId.toString()) || 0;
            return { ...convo, unreadCount };
        });

        res.json(conversationsWithCounts);

    } catch (error) {
        console.error("Error fetching conversations with unread counts:", error);
        res.status(500).send('Server Error');
    }
});

// --- ROUTE 2: Create a new conversation ---
router.post('/', auth, async (req, res) => {
    try {
        const { participants } = req.body;
        const currentUserId = req.user.id;
        let conversation = await Conversation.findOne({
            participants: { $all: participants }
        }).populate('participants', 'username');
        
        if (!conversation) {
            conversation = new Conversation({ 
                participants,
                unreadCount: new Map()
            });
            await conversation.save();
            conversation = await Conversation.findById(conversation._id).populate('participants', 'username');
        }
        
        res.json(conversation);
    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).send('Server Error');
    }
});

// --- ROUTE 3: Get all messages for a specific conversation ---
// router.get('/:conversationId/messages', auth, async (req, res) => {
//     try {
//         const messages = await Message.find({ conversationId: req.params.conversationId }).populate('sender', 'username');
//         console.log(messages[1]);
//         let newMessage = messages.slice(messages.length - 5,messages.length);
//         // console.log(newMessage);
//         console.log(messages.reverse())
//         res.json(messages);
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Server Error');
//     }
// });


router.get('/:conversationId/messages', auth, async (req, res) => {
    try {
        // 1. Get page and limit from query params, with default values.
        // Example: /messages?page=2&limit=20
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // A higher limit like 20 is good for chat.
        const conversationId = req.params.conversationId;

        // 2. Calculate the number of messages to skip in the database.
        // For page 1, skip = 0. For page 2, skip = 20.
        const skip = (page - 1) * limit;

        // 3. Get the total message count to calculate total pages.
        // This is crucial for the frontend to know when to stop fetching (the 'hasMore' state).
        const totalMessages = await Message.countDocuments({ conversationId });
        const totalPages = Math.ceil(totalMessages / limit);

        // 4. Query the database for a specific "page" of messages.
        const messages = await Message.find({ conversationId })
            .populate('sender', 'username') // Replaces sender ID with the sender's username.
            .sort({ createdAt: -1 })       // IMPORTANT: Gets the newest messages first.
            .skip(skip)                     // Skips the messages from previous pages.
            .limit(limit);                  // Limits the result to the page size.

        
        res.json({
            messages: messages.reverse(),
            currentPage: page,
            totalPages: totalPages,
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

module.exports = router;