import mongoose from 'mongoose';

const uri = "mongodb+srv://arunisharwal_db_user:LdZzcZh5o8W3GqWJ@reviewforgecluster.0ldctlq.mongodb.net/reviewforge?retryWrites=true&w=majority&appName=ReviewForgeCluster";

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  
  const users = await db.collection('users').find({}).toArray();
  console.log('--- USERS in Atlas ---');
  for (const u of users) {
    console.log(`${u.email} | role: ${u.role} | employeeId: ${u.employeeId}`);
  }

  const emps = await db.collection('employees').find({}).toArray();
  console.log('--- EMPLOYEES in Atlas ---');
  for (const e of emps) {
    console.log(`${e.id} | name: ${e.name} | managerId: ${e.managerId} | dept: ${e.departmentId}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Atlas error:', err.message);
  process.exit(1);
});
