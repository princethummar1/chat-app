const Conversation = require('../models/Conversation');
const User = require('../models/User');

// Create a new group conversation
exports.createGroupConversation = async (req, res) => {
  try {
    const { groupName, members } = req.body;
    const creatorId = req.user.id;

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
    const participants = [creatorId, ...members];

    // Check for duplicate group with same name and participants
    const existingGroup = await Conversation.findOne({
      isGroup: true,
      groupName: groupName.trim(),
      participants: { $all: participants, $size: participants.length }
    });

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
      groupAdmin: creatorId
    });

    // Save the group
    const savedGroup = await newGroup.save();

    // Populate the group with user details
    const populatedGroup = await Conversation.findById(savedGroup._id)
      .populate('participants', 'username profilePicture email')
      .populate('groupAdmin', 'username profilePicture email')
      .populate('lastMessage');

    res.status(201).json(populatedGroup);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Server error while creating group' });
  }
};