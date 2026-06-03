const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const Deposit = require('../models/Deposit');
const Project = require('../models/Project');
const Installment = require('../models/Installment');
const { protect } = require('../middleware/auth');

router.use(protect);

// Helper to calculate months elapsed
// Billing cutoff is PREVIOUS month: members pay current month's dues in the next month
// e.g. In June, they pay May's dues → June is NOT yet billable
const calculateMonthsElapsed = (joiningDate) => {
  const start = new Date(joiningDate);
  const now = new Date();
  // Billing ends at previous month
  const billingEnd = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (start > billingEnd) return 0;
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  const endYear = billingEnd.getFullYear();
  const endMonth = billingEnd.getMonth();
  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
};

// @desc    Get dashboard metrics
// @route   GET /api/reports/dashboard
// @access  Private
router.get('/dashboard', async (req, res) => {
  try {
    // 1. Total Members
    const totalMembers = await Member.countDocuments({});

    // 2. Total Deposits (Total Savings)
    const deposits = await Deposit.find({});
    const totalDeposits = deposits.reduce((sum, dep) => sum + dep.amount, 0);

    // 3. Member Savings Due Amount (For all members)
    const members = await Member.find({});
    let memberDueAmount = 0;
    for (const member of members) {
      const memberDeposits = deposits.filter(dep => String(dep.member) === String(member._id));
      const totalMemberDeposited = memberDeposits.reduce((sum, dep) => sum + dep.amount, 0);
      const monthsElapsed = calculateMonthsElapsed(member.joiningDate);
      const expectedDeposits = monthsElapsed * member.monthlyDepositAmount;
      const memberDue = Math.max(0, expectedDeposits - totalMemberDeposited);
      memberDueAmount += memberDue;
    }

    // 4. Total Investments
    const projects = await Project.find({});
    const totalInvestments = projects.reduce((sum, proj) => sum + proj.investmentAmount, 0);

    // 5. Total Installments Collected (Project Returns)
    const installments = await Installment.find({});
    const totalInstallmentsCollected = installments.reduce((sum, inst) => sum + inst.amount, 0);

    // 6. Project Installment Due Amount (For all projects)
    let projectDueAmount = 0;
    for (const project of projects) {
      const projInstallments = installments.filter(inst => String(inst.project) === String(project._id));
      const totalPaid = projInstallments.reduce((sum, inst) => sum + inst.amount, 0);
      const monthsElapsed = calculateMonthsElapsed(project.startDate);
      const activeMonths = Math.min(project.installmentDuration, monthsElapsed);
      const expectedInstallments = activeMonths * project.monthlyInstallmentAmount;
      const totalDue = Math.max(0, expectedInstallments - totalPaid);
      projectDueAmount += totalDue;
    }

    // 7. Total Profit (Return Amount - Investment Amount for all projects)
    const totalProfit = projects.reduce((sum, proj) => sum + (proj.returnAmount - proj.investmentAmount), 0);

    // 8. Active Projects
    const activeProjects = await Project.countDocuments({ status: 'active' });

    res.json({
      totalMembers,
      totalDeposits,
      totalDueAmount: memberDueAmount + projectDueAmount,
      memberDueAmount,
      projectDueAmount,
      totalInvestments,
      totalInstallmentsCollected,
      totalProfit,
      activeProjects
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Build date/month/year/range filter object for mongoose
const buildDateFilter = (query) => {
  const { date, month, year, startDate, endDate } = query;
  let filter = {};

  if (date) {
    // Single date filter (ignore time)
    const s = new Date(date);
    s.setHours(0, 0, 0, 0);
    const e = new Date(date);
    e.setHours(23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  } else if (startDate && endDate) {
    // Custom range filter
    const s = new Date(startDate);
    s.setHours(0, 0, 0, 0);
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  } else if (month) {
    // Format expects YYYY-MM
    const [y, m] = month.split('-');
    const s = new Date(parseInt(y), parseInt(m) - 1, 1);
    const e = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  } else if (year) {
    const s = new Date(parseInt(year), 0, 1);
    const e = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
    filter.date = { $gte: s, $lte: e };
  }
  // If none of the above match, filter stays {} → returns all records (all time)

  return filter;
};

// @desc    Get Member Deposit Report
// @route   GET /api/reports/member-deposits
// @access  Private
router.get('/member-deposits', async (req, res) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    
    // Query deposits
    const deposits = await Deposit.find(dateFilter)
      .populate('member', 'name memberId mobile')
      .populate('recordedBy', 'name')
      .sort({ date: -1 });

    res.json(deposits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get Member Due Report
// @route   GET /api/reports/member-dues
// @access  Private
router.get('/member-dues', async (req, res) => {
  try {
    const members = await Member.find({});
    const deposits = await Deposit.find({});

    const duesReport = members.map(member => {
      const memberDeposits = deposits.filter(dep => String(dep.member) === String(member._id));
      const totalDeposited = memberDeposits.reduce((sum, dep) => sum + dep.amount, 0);
      const monthsElapsed = calculateMonthsElapsed(member.joiningDate);
      const expectedDeposits = monthsElapsed * member.monthlyDepositAmount;
      const totalDue = Math.max(0, expectedDeposits - totalDeposited);

      return {
        _id: member._id,
        memberId: member.memberId,
        name: member.name,
        mobile: member.mobile,
        monthlyDepositAmount: member.monthlyDepositAmount,
        totalDeposited,
        totalDue,
        status: member.status
      };
    }).filter(m => m.totalDue > 0); // Only return members with dues

    res.json(duesReport);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get Project Collection Report
// @route   GET /api/reports/project-collections
// @access  Private
router.get('/project-collections', async (req, res) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    
    const installments = await Installment.find(dateFilter)
      .populate('project', 'projectName projectType driverName driverMobile')
      .populate('recordedBy', 'name')
      .sort({ date: -1 });

    res.json(installments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get Project Due Report
// @route   GET /api/reports/project-dues
// @access  Private
router.get('/project-dues', async (req, res) => {
  try {
    const projects = await Project.find({});
    const installments = await Installment.find({});

    const duesReport = projects.map(project => {
      const projInstallments = installments.filter(inst => String(inst.project) === String(project._id));
      const totalPaid = projInstallments.reduce((sum, inst) => sum + inst.amount, 0);
      
      const monthsElapsed = calculateMonthsElapsed(project.startDate);
      const activeMonths = Math.min(project.installmentDuration, monthsElapsed);
      const expectedInstallments = activeMonths * project.monthlyInstallmentAmount;
      const totalDue = Math.max(0, expectedInstallments - totalPaid);
      const remainingBalance = Math.max(0, project.returnAmount - totalPaid);

      return {
        _id: project._id,
        projectName: project.projectName,
        projectType: project.projectType,
        driverName: project.driverName,
        investmentAmount: project.investmentAmount,
        returnAmount: project.returnAmount,
        monthlyInstallmentAmount: project.monthlyInstallmentAmount,
        totalPaid,
        totalDue,
        remainingBalance,
        status: project.status
      };
    }).filter(p => p.totalDue > 0);

    res.json(duesReport);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get Profit Report
// @route   GET /api/reports/profits
// @access  Private
router.get('/profits', async (req, res) => {
  try {
    const projects = await Project.find({});
    const installments = await Installment.find({});

    const profitsReport = projects.map(project => {
      const projInstallments = installments.filter(inst => String(inst.project) === String(project._id));
      const totalPaid = projInstallments.reduce((sum, inst) => sum + inst.amount, 0);
      const profit = project.returnAmount - project.investmentAmount;

      return {
        _id: project._id,
        projectName: project.projectName,
        projectType: project.projectType,
        driverName: project.driverName,
        driverMobile: project.driverMobile,
        investmentAmount: project.investmentAmount,
        returnAmount: project.returnAmount,
        totalPaid,
        profit,
        status: project.status
      };
    });

    res.json(profitsReport);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
