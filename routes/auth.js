const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'somiti_secret_key_123', {
    expiresIn: '30d',
  });
};

// @desc    Auth user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({ message: 'ইউজারনেম এবং পাসওয়ার্ড প্রদান করুন' });
    }

    const user = await User.findOne({ username }).populate('memberId');

    if (user && (await user.matchPassword(password))) {
      if (user.status !== 'active') {
        return res.status(403).json({ message: 'আপনার অ্যাকাউন্টটি নিষ্ক্রিয় রয়েছে' });
      }

      res.json({
        _id: user._id,
        name: user.name,
        username: user.username,
        mobile: user.mobile,
        role: user.role,
        status: user.status,
        memberId: user.memberId,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'ভুল ইউজারনেম বা পাসওয়ার্ড' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('memberId');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'ব্যবহারকারী পাওয়া যায়নি' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
