import mongoose from 'mongoose';

const uri = "mongodb+srv://arunisharwal_db_user:LdZzcZh5o8W3GqWJ@reviewforgecluster.0ldctlq.mongodb.net/reviewforge?retryWrites=true&w=majority&appName=ReviewForgeCluster";

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  const emps = await db.collection('employees').find({}).toArray();
  console.log('Employees in Atlas:', emps.length);
  for (const e of emps) {
    console.log(`- ${e.id} | ${e.name} | ${e.email} | ${e.departmentId}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
