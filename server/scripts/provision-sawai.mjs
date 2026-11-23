import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = "mongodb+srv://arunisharwal_db_user:LdZzcZh5o8W3GqWJ@reviewforgecluster.0ldctlq.mongodb.net/reviewforge?retryWrites=true&w=majority&appName=ReviewForgeCluster";

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const orgId = 'org-reviewforge-default';
  const email = 'sawai.singh@reviewforge.internal';
  const name = 'Sawai Singh';
  const empId = 'emp-014';
  const empNumber = 'RF-1014';

  // 1. Ensure Employee in Atlas
  const existingEmp = await db.collection('employees').findOne({ email });
  if (existingEmp) {
    console.log('Employee already exists in Atlas:', existingEmp._id, existingEmp.id, existingEmp.employeeNumber);
  } else {
    const res = await db.collection('employees').insertOne({
      id: empId,
      organizationId: orgId,
      employeeNumber: empNumber,
      name,
      email,
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      departmentId: 'dept-eng',
      departmentName: 'Engineering & Infrastructure',
      jobTitle: 'Senior AI Systems & Platform Engineer',
      managerId: 'emp-001',
      managerName: 'Dr. Aris Thorne',
      joinDate: '2026-11-23',
      employmentStatus: 'Full-Time',
      reviewStatus: 'Not Started',
      location: 'Bengaluru, India (Hybrid)',
      bio: 'Infrastructure specialist focusing on production AI model serving, distributed low-latency streaming pipelines, and microservice resilience.',
      skills: ['Python', 'PyTorch', 'Kubernetes', 'Kafka', 'LLM Inference', 'Go', 'Redis'],
      isDeactivated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Created employee in Atlas:', res.insertedId);
  }

  // 2. Ensure User login account in Atlas
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Employee@ReviewForge2026!', salt);

  const existingUser = await db.collection('users').findOne({ email });
  if (existingUser) {
    await db.collection('users').updateOne(
      { email },
      {
        $set: {
          passwordHash,
          role: 'employee',
          employeeId: empId,
          name,
          status: 'active',
          updatedAt: new Date()
        }
      }
    );
    console.log('Updated existing user in Atlas with fresh password and employee link');
  } else {
    const userRes = await db.collection('users').insertOne({
      id: `usr-${empId}`,
      name,
      email,
      passwordHash,
      role: 'employee',
      organizationId: orgId,
      employeeId: empId,
      departmentId: 'dept-eng',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Created user login in Atlas:', userRes.insertedId);
  }

  console.log('--- Provisioning Complete ---');
  console.log(`Email: ${email}`);
  console.log('Password: Employee@ReviewForge2026!');
  console.log('Role: employee');
  console.log(`Employee ID: ${empId}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
