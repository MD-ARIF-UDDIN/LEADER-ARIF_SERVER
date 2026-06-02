const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'somiti_secret_key_123');

      // Get user from the token, excluding password
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'ব্যবহারকারী পাওয়া যায়নি' });
      }

      if (req.user.status !== 'active') {
        return res.status(403).json({ message: 'আপনার অ্যাকাউন্টটি নিষ্ক্রিয় রয়েছে' });
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'অনুমোদিত নয়, টোকেন ব্যর্থ হয়েছে' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'অনুমোদিত নয়, কোনো টোকেন পাওয়া যায়নি' });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'অনুমোদিত নয়, শুধুমাত্র এডমিনদের জন্য প্রযোজ্য' });
  }
};

module.exports = { protect, admin };
