const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Deposit = require('../models/Deposit');
const { protect, admin } = require('../middleware/auth');

// Helper to calculate months elapsed since joining date (inclusive of joining month and current month)
const calculateMonthsElapsed = (joiningDate) => {
  const start = new Date(joiningDate);
  const end = new Date();
  if (start > end) return 0;
  
  const startYear = start.getFullYear();
  const startMonth = start.getMonth(); // 0-11
  const endYear = end.getFullYear();
  const endMonth = end.getMonth(); // 0-11
  
  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
};

// Helper to generate list of months from start date to current month
const generateMonthList = (startDate) => {
  const start = new Date(startDate);
  const end = new Date();
  const list = [];
  
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  
  while (current <= endMonth) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    list.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }
  
  return list; // Array of "YYYY-MM" strings
};

// @desc    Get all members with calculations
// @route   GET /api/members
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};
    
    // If role is member, restrict to their own member record
    if (req.user.role === 'member') {
      if (!req.user.memberId) {
        return res.json([]); // Return empty list if no memberId linked
      }
      query._id = req.user.memberId;
    }

    const members = await Member.find(query).sort({ createdAt: -1 });
    
    const membersWithCalculations = await Promise.all(
      members.map(async (member) => {
        const deposits = await Deposit.find({ member: member._id });
        const totalDeposited = deposits.reduce((sum, dep) => sum + dep.amount, 0);
        
        const monthsElapsed = calculateMonthsElapsed(member.joiningDate);
        const expectedDeposits = monthsElapsed * member.monthlyDepositAmount;
        
        const totalDue = Math.max(0, expectedDeposits - totalDeposited);
        const currentBalance = totalDeposited;

        return {
          ...member.toObject(),
          totalDeposited,
          totalDue,
          currentBalance,
          monthsElapsed
        };
      })
    );

    res.json(membersWithCalculations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single member details with calculations & due schedules
// @route   GET /api/members/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    // If user is a member, they can only view their own profile
    if (req.user.role === 'member' && String(req.user.memberId) !== req.params.id) {
      return res.status(403).json({ message: 'অনুমোদিত নয়, আপনি শুধুমাত্র আপনার তথ্য দেখতে পারবেন' });
    }

    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: 'সদস্য পাওয়া যায়নি' });
    }

    const deposits = await Deposit.find({ member: member._id }).sort({ date: -1 });
    const totalDeposited = deposits.reduce((sum, dep) => sum + dep.amount, 0);
    
    const monthsElapsed = calculateMonthsElapsed(member.joiningDate);
    const expectedDeposits = monthsElapsed * member.monthlyDepositAmount;
    const totalDue = Math.max(0, expectedDeposits - totalDeposited);
    
    // Generate monthly schedule status
    const expectedMonths = generateMonthList(member.joiningDate);
    const schedule = expectedMonths.map((mStr) => {
      // Find deposits corresponding to this specific month YYYY-MM
      const monthDeposits = deposits.filter((d) => d.month === mStr);
      const paidAmount = monthDeposits.reduce((sum, d) => sum + d.amount, 0);
      const isPaid = paidAmount >= member.monthlyDepositAmount;
      
      return {
        month: mStr, // "YYYY-MM"
        expectedAmount: member.monthlyDepositAmount,
        paidAmount,
        isPaid,
        status: isPaid ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'DUE'),
        deposits: monthDeposits
      };
    });

    res.json({
      member,
      calculations: {
        totalDeposited,
        expectedDeposits,
        totalDue,
        currentBalance: totalDeposited,
        monthsElapsed
      },
      schedule,
      deposits
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Add member
// @route   POST /api/members
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  const { name, mobile, address, nid, joiningDate, monthlyDepositAmount, status } = req.body;

  try {
    const member = new Member({
      name,
      mobile,
      address,
      nid,
      joiningDate,
      monthlyDepositAmount: Number(monthlyDepositAmount),
      status
    });

    const createdMember = await member.save();
    res.status(201).json(createdMember);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Edit member
// @route   PUT /api/members/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  const { name, mobile, address, nid, joiningDate, monthlyDepositAmount, status } = req.body;

  try {
    const member = await Member.findById(req.params.id);

    if (member) {
      member.name = name || member.name;
      member.mobile = mobile || member.mobile;
      member.address = address || member.address;
      member.nid = nid || member.nid;
      member.joiningDate = joiningDate || member.joiningDate;
      member.monthlyDepositAmount = monthlyDepositAmount !== undefined ? Number(monthlyDepositAmount) : member.monthlyDepositAmount;
      member.status = status || member.status;

      const updatedMember = await member.save();
      res.json(updatedMember);
    } else {
      res.status(404).json({ message: 'সদস্য পাওয়া যায়নি' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Record member deposit
// @route   POST /api/members/:id/deposit
// @access  Private/Admin
router.post('/:id/deposit', protect, admin, async (req, res) => {
  const { amount, month, date } = req.body;

  try {
    const member = await Member.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ message: 'সদস্য পাওয়া যায়নি' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'সঠিক জমার পরিমাণ দিন' });
    }

    if (!month) {
      return res.status(400).json({ message: 'মাস উল্লেখ করুন' });
    }

    const deposit = new Deposit({
      member: member._id,
      amount: Number(amount),
      month, // e.g. "2026-06"
      date: date ? new Date(date) : Date.now(),
      recordedBy: req.user._id
    });

    const savedDeposit = await deposit.save();
    res.status(201).json(savedDeposit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Get member deposit history
// @route   GET /api/members/:id/history
// @access  Private
router.get('/:id/history', protect, async (req, res) => {
  try {
    if (req.user.role === 'member' && String(req.user.memberId) !== req.params.id) {
      return res.status(403).json({ message: 'অনুমোদিত নয়' });
    }

    const deposits = await Deposit.find({ member: req.params.id })
      .populate('recordedBy', 'name')
      .sort({ date: -1 });
      
    res.json(deposits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
