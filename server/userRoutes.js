const express = require('express');
const router = express.Router();
const auth = require('./authMiddelware');
const User = require('./User');

// @route   GET api/users
// @desc    Get all users except the logged-in one
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Find all users but exclude the current user from the list
    // Also, only return the id and username fields, not the password
    const users = await User.find({ _id: { $ne: req.user.id } }).select('username lastSeen isOnline');
    
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});



module.exports = router;

