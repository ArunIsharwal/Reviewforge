import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/reviewforge';

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

    const revs = await db.collection('performancereviews').find({}).toArray();
    console.log('--- REVIEWS in Atlas ---', revs.length);
    for (const r of revs) {
        console.log(`${r.id} | empId: ${r.employeeId} | name: ${r.employeeName} | status: ${r.status}`);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Atlas error:', err.message);
    process.exit(1);
});
