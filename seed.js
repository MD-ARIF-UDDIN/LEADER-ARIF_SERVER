const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns');
const User = require('./models/User');
const Counter = require('./models/Counter');
const Member = require('./models/Member');
const Deposit = require('./models/Deposit');

// Force Node to use Google DNS for SRV record lookup resolution
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn('Failed to set custom DNS servers in seed:', e.message);
}

dotenv.config();

const seedSystem = async () => {
  try {
    console.log('Connecting to database for seeding...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected.');

    // 1. Seed default counter sequence for members
    const counter = await Counter.findOne({ id: 'memberId' });
    if (!counter) {
      await Counter.create({ id: 'memberId', seq: 1000 });
      console.log('Member sequence counter initialized to 1000.');
    } else {
      console.log('Member sequence counter already exists.');
    }

    // 2. Seed default admin user
    const adminUser = await User.findOne({ username: 'admin' });
    if (!adminUser) {
      await User.create({
        name: 'এডমিন',
        mobile: '01700000000',
        username: 'admin',
        password: 'password123', // Will be hashed by User pre-save hook
        role: 'admin',
        status: 'active'
      });
      console.log('Default Admin user created successfully.');
      console.log('Username: admin');
      console.log('Password: password123');
    } else {
      console.log('Admin user already exists.');
    }

    // 3. Update all members' joiningDate to 01 Jul 2024
    // Business rule: members pay current month's dues in the next month (arrears).
    // With billing cutoff = previous month, Jul 2024 -> May 2026 = 23 months x 2,000 = 46,000 tk
    console.log("Updating all members' joiningDate to 2024-07-01...");
    const targetDate = new Date('2024-07-01T00:00:00.000Z');
    const updateResult = await Member.updateMany({}, { $set: { joiningDate: targetDate } });
    console.log(`Updated joiningDate to 2024-07-01 for ${updateResult.matchedCount} members (modified: ${updateResult.modifiedCount}).`);

    // 4. Seed per-member monthly deposits
    // Business rule: members pay in arrears - July's dues are paid in August, etc.
    // Deposit date = 1st of the NEXT month after the due month.
    // Monthly rate = 2000 tk. Payments run consecutively from July 2024.
    //
    // memberId format: 1001, 1002, ..., 1016 (counter starts at 1000, first member = 1001)
    // User IDs 1-16 map to memberIds 1001-1016.
    const memberBalances = [
      { memberId: '1',  totalPaid: 44000 },
      { memberId: '2',  totalPaid: 40000 },
      { memberId: '3',  totalPaid: 36000 },
      { memberId: '4',  totalPaid: 42000 },
      { memberId: '5',  totalPaid: 40000 },
      { memberId: '6',  totalPaid: 40000 },
      { memberId: '7',  totalPaid: 44000 },
      { memberId: '8',  totalPaid: 36000 },
      { memberId: '9',  totalPaid: 44000 },
      { memberId: '10', totalPaid: 42000 },
      { memberId: '11', totalPaid: 40000 },
      { memberId: '12', totalPaid: 44000 },
      { memberId: '13', totalPaid: 44000 },
      { memberId: '14', totalPaid: 38000 },
      { memberId: '15', totalPaid: 38000 },
      { memberId: '16', totalPaid: 36000 },
    ];

    const MONTHLY_AMOUNT = 2000;

    // Generate full month list: Jul 2024 -> May 2026 (23 months)
    const allMonths = [];
    let cur = new Date(2024, 6, 1); // July 2024 (JS month 6 = July)
    const endMonth = new Date(2026, 4, 1); // May 2026 (JS month 4 = May)
    while (cur <= endMonth) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      allMonths.push(`${y}-${m}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    console.log(`Month range: ${allMonths[0]} -> ${allMonths[allMonths.length - 1]} (${allMonths.length} months)`);

    // Clear all existing deposits before re-seeding
    const deleted = await Deposit.deleteMany({});
    console.log(`Cleared ${deleted.deletedCount} existing deposit records.`);

    const currentAdmin = await User.findOne({ username: 'admin' });
    let totalDepositsCreated = 0;

    for (const { memberId, totalPaid } of memberBalances) {
      const member = await Member.findOne({ memberId });
      if (!member) {
        console.warn(`  WARNING: Member with memberId ${memberId} not found, skipping.`);
        continue;
      }

      const monthsPaid = Math.round(totalPaid / MONTHLY_AMOUNT);
      const paidMonths = allMonths.slice(0, monthsPaid);

      const deposits = paidMonths.map((monthStr) => {
        // Deposit date = 1st of following month (arrears: July's due paid in August)
        // monthStr e.g. "2024-07" -> m=7 (1-indexed) -> new Date(2024, 7, 1) = Aug 1, 2024
        const [y, m] = monthStr.split('-').map(Number);
        const depositDate = new Date(y, m, 1); // m is already 1-indexed, JS 0-indexed = next month
        return {
          member: member._id,
          amount: MONTHLY_AMOUNT,
          month: monthStr,
          date: depositDate,
          recordedBy: currentAdmin?._id
        };
      });

      await Deposit.insertMany(deposits);
      console.log(`  OK memberId ${memberId}: ${monthsPaid} months x tk${MONTHLY_AMOUNT} = tk${totalPaid} (${paidMonths[0]} -> ${paidMonths[paidMonths.length - 1]})`);
      totalDepositsCreated += deposits.length;
    }

    console.log(`\nTotal deposit records created: ${totalDepositsCreated}`);
    console.log('Database seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error(`Seeding error: ${error.message}`);
    process.exit(1);
  }
};

seedSystem();
