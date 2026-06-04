const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const { protect, admin } = require('../middleware/auth');

// Build date/month/year/range filter object for mongoose
const buildDateFilter = (query) => {
  const { date, month, year, startDate, endDate } = query;
  let filter = {};

  if (date) {
    const s = new Date(date);
    s.setHours(0, 0, 0, 0);
    const e = new Date(date);
    e.setHours(23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  } else if (startDate && endDate) {
    const s = new Date(startDate);
    s.setHours(0, 0, 0, 0);
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  } else if (month) {
    const [y, m] = month.split('-');
    const s = new Date(parseInt(y), parseInt(m) - 1, 1);
    const e = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  } else if (year) {
    const s = new Date(parseInt(year), 0, 1);
    const e = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  }

  return filter;
};

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    
    // Category filter if present
    if (req.query.category && req.query.category !== 'all') {
      dateFilter.category = req.query.category;
    }

    const expenses = await Expense.find(dateFilter)
      .populate('recordedBy', 'name')
      .sort({ date: -1 });

    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create an expense
// @route   POST /api/expenses
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  const { title, amount, date, category, description } = req.body;

  try {
    if (!title || !amount || amount <= 0) {
      return res.status(400).json({ message: 'সঠিক শিরোনাম ও খরচের পরিমাণ দিন' });
    }

    const expense = new Expense({
      title,
      amount: Number(amount),
      date: date ? new Date(date) : Date.now(),
      category: category || 'other',
      description,
      recordedBy: req.user._id
    });

    const createdExpense = await expense.save();
    res.status(201).json(createdExpense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Update an expense
// @route   PUT /api/expenses/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  const { title, amount, date, category, description } = req.body;

  try {
    const expense = await Expense.findById(req.params.id);

    if (expense) {
      expense.title = title || expense.title;
      expense.amount = amount !== undefined ? Number(amount) : expense.amount;
      expense.date = date ? new Date(date) : expense.date;
      expense.category = category || expense.category;
      expense.description = description !== undefined ? description : expense.description;

      const updatedExpense = await expense.save();
      res.json(updatedExpense);
    } else {
      res.status(404).json({ message: 'খরচের রেকর্ড পাওয়া যায়নি' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (expense) {
      await expense.deleteOne();
      res.json({ message: 'খরচ সফলভাবে মুছে ফেলা হয়েছে' });
    } else {
      res.status(404).json({ message: 'খরচের রেকর্ড পাওয়া যায়নি' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
