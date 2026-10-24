// Create an admin account, or reset an existing admin's password.
//
//   npm run create-admin -- <username> "<Full Name>"
//   npm run create-admin -- <username> --reset
//
// Admins are only created here (never from the web app). The temporary password is printed
// once and saved in credentials/; it must be changed at first sign-in.

import 'dotenv/config';
import mongoose from 'mongoose';
import { User, audit } from '../src/models.js';
import { hashPassword, tempPassword } from '../src/auth.js';
import { saveCredentials } from '../src/credentials.js';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const [username, name] = args.filter((a) => !a.startsWith('--'));
if (!username || (!reset && !name)) {
  console.error('Usage: npm run create-admin -- <username> "<Full Name>"   |   npm run create-admin -- <username> --reset');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/class-record');
const pw = tempPassword();
let user = await User.findOne({ username: username.toLowerCase() });

if (reset) {
  if (!user || user.role !== 'admin') {
    console.error(`No admin account named "${username}".`);
    process.exit(1);
  }
  user.passwordHash = await hashPassword(pw);
  user.mustChangePassword = true;
  user.disabled = false;
  await user.save();
  audit(null, 'admin.reset-password', `${user.name} (${user.username})`, 'from the command line');
} else {
  if (user) {
    console.error(`The username "${username}" is already taken (role: ${user.role}).`);
    process.exit(1);
  }
  user = await User.create({ username: username.toLowerCase(), name: name.toUpperCase(), role: 'admin', passwordHash: await hashPassword(pw) });
  audit(null, 'admin.create', `${user.name} (${user.username})`, 'from the command line');
}

saveCredentials('ADMIN', [{ username: user.username, name: user.name, tempPassword: pw }]);
console.log(`Admin "${user.username}" ${reset ? 'password reset' : 'created'}.`);
console.log(`Temporary password: ${pw}`);
console.log('It must be changed at first sign-in. Also saved in server/credentials/.');
await new Promise((r) => setTimeout(r, 200)); // let the audit write finish
await mongoose.disconnect();
