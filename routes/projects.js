const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const Installment = require('../models/Installment');
const { protect, admin } = require('../middleware/auth');

// Helper to calculate months elapsed since project start date (inclusive of start month and current month)
const calculateMonthsElapsed = (startDate) => {
  const start = new Date(startDate);
  const end = new Date();
  if (start > end) return 0;

  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth();

  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
};

// Helper to generate list of months from start date up to installment duration
const generateProjectMonthsList = (startDate, durationMonths) => {
  const start = new Date(startDate);
  const list = [];
  
  for (let i = 0; i < durationMonths; i++) {
    const temp = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const year = temp.getFullYear();
    const month = String(temp.getMonth() + 1).padStart(2, '0');
    list.push(`${year}-${month}`);
  }
  
  return list; // Array of "YYYY-MM" strings for the duration of the project
};

// @desc    Get all projects with calculations
// @route   GET /api/projects
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const [projects, allInstallments] = await Promise.all([
      Project.find({}).sort({ createdAt: -1 }),
      Installment.find({})
    ]);

    const installmentMap = new Map();
    for (const inst of allInstallments) {
      const key = String(inst.project);
      installmentMap.set(key, (installmentMap.get(key) || 0) + inst.amount);
    }

    const projectsWithCalculations = projects.map((project) => {
      const totalPaid = installmentMap.get(String(project._id)) || 0;

      const monthsElapsed = calculateMonthsElapsed(project.startDate);
      const activeMonths = Math.min(project.installmentDuration, monthsElapsed);
      const expectedInstallments = activeMonths * project.monthlyInstallmentAmount;

      const totalDue = Math.max(0, expectedInstallments - totalPaid);
      const remainingBalance = Math.max(0, project.returnAmount - totalPaid);
      const profit = project.returnAmount - project.investmentAmount;

      return {
        ...project.toObject(),
        totalPaid,
        totalDue,
        remainingBalance,
        profit,
        monthsElapsed
      };
    });

    res.json(projectsWithCalculations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Helper to normalize month string to YYYY-MM format
const normalizeMonth = (m) => {
  if (!m) return '';
  const trimmed = String(m).trim();
  const parts = trimmed.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    return `${year}-${month}`;
  }
  return trimmed;
};

// @desc    Get single project details with calculations & schedules
// @route   GET /api/projects/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'প্রজেক্ট পাওয়া যায়নি' });
    }

    const installments = await Installment.find({ project: project._id }).sort({ date: -1 });
    const totalPaid = installments.reduce((sum, inst) => sum + inst.amount, 0);

    const monthsElapsed = calculateMonthsElapsed(project.startDate);
    const activeMonths = Math.min(project.installmentDuration, monthsElapsed);
    const expectedInstallments = activeMonths * project.monthlyInstallmentAmount;

    const totalDue = Math.max(0, expectedInstallments - totalPaid);
    const remainingBalance = Math.max(0, project.returnAmount - totalPaid);
    const profit = project.returnAmount - project.investmentAmount;

    // Generate schedule status for all duration months
    const durationMonthsList = generateProjectMonthsList(project.startDate, project.installmentDuration);
    const currentStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();

    const schedule = durationMonthsList.map((mStr) => {
      const monthInstallments = installments.filter((inst) => normalizeMonth(inst.month) === mStr);
      const paidAmount = monthInstallments.reduce((sum, inst) => sum + inst.amount, 0);
      const isPaid = paidAmount >= project.monthlyInstallmentAmount;
      
      let status = 'DUE';
      if (isPaid) {
        status = 'PAID';
      } else if (paidAmount > 0) {
        status = 'PARTIAL';
      } else {
        // If the month is in the future, it shouldn't show as overdue due, just "UPCOMING" or simple status.
        // But let's check if month is after current month.
        if (mStr > currentStr) {
          status = 'UPCOMING';
        }
      }

      return {
        month: mStr,
        expectedAmount: project.monthlyInstallmentAmount,
        paidAmount,
        status,
        installments: monthInstallments
      };
    });

    res.json({
      project,
      calculations: {
        totalPaid,
        expectedInstallments,
        totalDue,
        remainingBalance,
        profit,
        monthsElapsed
      },
      schedule,
      installments
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create project
// @route   POST /api/projects
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  const {
    projectName,
    projectType,
    driverName,
    driverMobile,
    driverAddress,
    driverNid,
    nomineeName,
    nomineeMobile,
    investmentAmount,
    returnAmount,
    startDate,
    installmentDuration,
    monthlyInstallmentAmount,
    status
  } = req.body;

  try {
    const project = new Project({
      projectName,
      projectType,
      driverName,
      driverMobile,
      driverAddress,
      driverNid,
      nomineeName,
      nomineeMobile,
      investmentAmount: Number(investmentAmount),
      returnAmount: Number(returnAmount),
      startDate,
      installmentDuration: Number(installmentDuration),
      monthlyInstallmentAmount: Number(monthlyInstallmentAmount),
      status
    });

    const createdProject = await project.save();
    res.status(201).json(createdProject);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Edit project
// @route   PUT /api/projects/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (project) {
      project.projectName = req.body.projectName || project.projectName;
      project.projectType = req.body.projectType || project.projectType;
      project.driverName = req.body.driverName || project.driverName;
      project.driverMobile = req.body.driverMobile || project.driverMobile;
      project.driverAddress = req.body.driverAddress || project.driverAddress;
      project.driverNid = req.body.driverNid || project.driverNid;
      project.nomineeName = req.body.nomineeName || project.nomineeName;
      project.nomineeMobile = req.body.nomineeMobile || project.nomineeMobile;
      project.investmentAmount = req.body.investmentAmount !== undefined ? Number(req.body.investmentAmount) : project.investmentAmount;
      project.returnAmount = req.body.returnAmount !== undefined ? Number(req.body.returnAmount) : project.returnAmount;
      project.startDate = req.body.startDate || project.startDate;
      project.installmentDuration = req.body.installmentDuration !== undefined ? Number(req.body.installmentDuration) : project.installmentDuration;
      project.monthlyInstallmentAmount = req.body.monthlyInstallmentAmount !== undefined ? Number(req.body.monthlyInstallmentAmount) : project.monthlyInstallmentAmount;
      project.status = req.body.status || project.status;

      const updatedProject = await project.save();
      res.json(updatedProject);
    } else {
      res.status(404).json({ message: 'প্রজেক্ট পাওয়া যায়নি' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Collect installment
// @route   POST /api/projects/:id/installment
// @access  Private/Admin
router.post('/:id/installment', protect, admin, async (req, res) => {
  const { amount, month, date } = req.body;

  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'প্রজেক্ট পাওয়া যায়নি' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'সঠিক কিস্তির পরিমাণ দিন' });
    }

    if (!month) {
      return res.status(400).json({ message: 'মাস উল্লেখ করুন' });
    }

    const installment = new Installment({
      project: project._id,
      amount: Number(amount),
      month, // Format: "YYYY-MM"
      date: date ? new Date(date) : Date.now(),
      recordedBy: req.user._id
    });

    const savedInstallment = await installment.save();
    res.status(201).json(savedInstallment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Get project installment history
// @route   GET /api/projects/:id/history
// @access  Private
router.get('/:id/history', protect, async (req, res) => {
  try {
    const installments = await Installment.find({ project: req.params.id })
      .populate('recordedBy', 'name')
      .sort({ date: -1 });

    res.json(installments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Edit project installment
// @route   PUT /api/projects/installment/:installmentId
// @access  Private/Admin
router.put('/installment/:installmentId', protect, admin, async (req, res) => {
  const { amount, month, date } = req.body;

  try {
    const installment = await Installment.findById(req.params.installmentId);
    if (!installment) {
      return res.status(404).json({ message: 'কিস্তি পাওয়া যায়নি' });
    }

    if (amount !== undefined) {
      if (amount <= 0) {
        return res.status(400).json({ message: 'সঠিক কিস্তির পরিমাণ দিন' });
      }
      installment.amount = Number(amount);
    }
    if (month !== undefined) {
      if (!month) {
        return res.status(400).json({ message: 'মাস উল্লেখ করুন' });
      }
      installment.month = month;
    }
    if (date !== undefined) {
      installment.date = new Date(date);
    }

    const updatedInstallment = await installment.save();
    res.json(updatedInstallment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete project installment
// @route   DELETE /api/projects/installment/:installmentId
// @access  Private/Admin
router.delete('/installment/:installmentId', protect, admin, async (req, res) => {
  try {
    const installment = await Installment.findById(req.params.installmentId);
    if (!installment) {
      return res.status(404).json({ message: 'কিস্তি পাওয়া যায়নি' });
    }

    await installment.deleteOne();
    res.json({ message: 'কিস্তি সফলভাবে মুছে ফেলা হয়েছে' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
