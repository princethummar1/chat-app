const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./User'); // Import the User model

const router = express.Router();

// --- Registration Route ---
router.post('/register', async (req, res) => {
  try {
    console.log(`hello`)
    const { username, password } = req.body;
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    user = new User({ username, password });
    await user.save();
    res.status(201).send('User registered successfully');
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// --- Login Route ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Create and return a JWT
    const payload = { user: { id: user.id, username: user.username } };
    jwt.sign(
      payload,
      'your_jwt_secret', // Use a secret from environment variables in a real app
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// --- Verify current user ---
router.get('/me', (req, res) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, 'your_jwt_secret');
    // Return the user payload stored in the token
    return res.json({ user: decoded.user });
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }
});

module.exports = router;