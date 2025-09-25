const express = require('express');
const router = express.Router();
const auth = require('./authMiddelware'); // Fixed typo in filename
const Conversation = require('./Conversation');
const Message = require('./Message');
const User = require('./User');

// --- ROUTE 1: Get all of a user's conversations with unread counts ---
router.get('/', auth, async (req, res) => {
    try {
        const currentUserId = req.user.id;

        // Fetch all conversations for the user
        const conversations = await Conversation.find({
            participants: currentUserId
        })
            .populate('participants', 'username')
            .lean();

        // For each conversation, calculate the unread count
        const conversationsWithCounts = conversations.map(convo => {
            // Handle both Map and object formats for unreadCount
            let unreadCount = 0;
            if (convo.unreadCount) {
                if (convo.unreadCount instanceof Map) {
                    unreadCount = convo.unreadCount.get(currentUserId.toString()) || 0;
                } else if (typeof convo.unreadCount === 'object') {
                    unreadCount = convo.unreadCount[currentUserId] || 0;
                }
            }
            return { ...convo, unreadCount };
        });

        res.json(conversationsWithCounts);

    } catch (error) {
        console.error("Error fetching conversations with unread counts:", error);
        res.status(500).send('Server Error');
    }
});

// --- ROUTE 2: Create a new conversation ---
// --- ROUTE 2: Create a new conversation (Corrected Logic) ---
router.post('/', auth, async (req, res) => {
    try {
        // Assume this route is ONLY for one-on-one chats for clarity.
        // We will use POST /group for groups.
        const { participants } = req.body;
        const currentUserId = req.user.id;

        // 1. VALIDATION: Ensure participants array is provided and not empty.
        if (!participants || participants.length === 0) {
            return res.status(400).json({ message: 'Participants array is required.' });
        }

        // 2. IDENTIFY OTHER USER: Find the ID that is NOT the current user.
        // This works whether the client sends one ID or both.
        const otherUserId = participants.find(id => id.toString() !== currentUserId.toString());

        if (!otherUserId) {
            return res.status(400).json({ message: 'Could not identify the other participant.' });
        }

        // 3. DEFINE PARTICIPANTS: Create the final, correct array of participants.
        const allParticipants = [currentUserId, otherUserId];

        // 4. CHECK FOR EXISTING CONVERSATION: Use the corrected participants array.
        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: allParticipants, $size: 2 }
        }).populate('participants', 'username');

        // 5. CREATE NEW CONVERSATION IF NEEDED
        if (!conversation) {
            conversation = new Conversation({
                participants: allParticipants,
                // Initialize unreadCount for both users
                unreadCount: { [currentUserId]: 0, [otherUserId]: 0 }
            });
            await conversation.save();
            // Re-fetch to populate participants
            conversation = await Conversation.findById(conversation._id).populate('participants', 'username');
        }

        return res.json(conversation);

    } catch (error) {
        console.error('Error creating one-on-one conversation:', error);
        res.status(500).send('Server Error');
    }
});

// --- ROUTE 3: Create a new group conversation ---
router.post('/group', auth, async (req, res) => {
    try {
        const { groupName, members } = req.body;
        const currentUserId = req.user.id;

        // Validate input
        if (!groupName || !groupName.trim()) {
            return res.status(400).json({ message: 'Group name is required' });
        }

        if (!members || !Array.isArray(members) || members.length < 2) {
            return res.status(400).json({
                message: 'At least two other members are required to create a group'
            });
        }

        // Check if all member IDs are valid
        const validMembers = await User.find({
            _id: { $in: members }
        }).select('_id');

        if (validMembers.length !== members.length) {
            return res.status(400).json({
                message: 'One or more member IDs are invalid'
            });
        }

        // Create the participants array (creator + selected members)
        const participants = [currentUserId, ...members];

        // Check for duplicate group with same name and participants
        const existingGroup = await Conversation.findOne({
            isGroup: true,
            groupName: groupName.trim(),
            participants: { $all: participants, $size: participants.length }
        }).populate('participants', 'username');

        if (existingGroup) {
            return res.status(400).json({
                message: 'A group with this name and participants already exists'
            });
        }

        // Create the new group conversation
        const newGroup = new Conversation({
            participants,
            isGroup: true,
            groupName: groupName.trim(),
            groupAdmin: currentUserId,
            unreadCount: new Map()
        });

        // Save the group
        await newGroup.save();

        // Populate the group with user details
        const populatedGroup = await Conversation.findById(newGroup._id)
            .populate('participants', 'username')
            .populate('groupAdmin', 'username');

        res.status(201).json(populatedGroup);
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ message: 'Server error while creating group' });
    }
});

// --- ROUTE 4: Get all messages for a specific conversation ---
router.get('/:conversationId/messages', auth, async (req, res) => {
    try {
        // 1. Get page and limit from query params, with default values.
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const conversationId = req.params.conversationId;

        // 2. Calculate the number of messages to skip in the database.
        const skip = (page - 1) * limit;

        // 3. Get the total message count to calculate total pages.
        const totalMessages = await Message.countDocuments({ conversationId });
        const totalPages = Math.ceil(totalMessages / limit);

        // 4. Query the database for a specific "page" of messages.
        const messages = await Message.find({ conversationId })
            .populate('sender', 'username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);


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