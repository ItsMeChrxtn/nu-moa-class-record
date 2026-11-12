// Create an admin account, or reset an existing admin's password.
//
//   npm run create-admin -- <username> "<Full Name>"
//   npm run create-admin -- <username> --reset
//   npm run create-admin -- <username> "<Full Name>" --password <password>   (a chosen password, no forced change)
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
const pwAt = args.indexOf('--password');
const chosen = pwAt >= 0 ? args[pwAt + 1] : null;
if (pwAt >= 0 && (!chosen || chosen.length < 8)) {
  console.error('--password needs a password of at least 8 characters.');
  process.exit(1);
}
const [username, name] = args.filter((a, i) => !a.startsWith('--') && !(pwAt >= 0 && i === pwAt + 1));
if (!username || (!reset && !name)) {
  console.error('Usage: npm run create-admin -- <username> "<Full Name>"   |   npm run create-admin -- <username> --reset');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/class-record');
const pw = chosen || tempPassword();
let user = await User.findOne({ username: username.toLowerCase() });

if (reset) {
  if (!user || user.role !== 'admin') {
    console.error(`No admin account named "${username}".`);
    process.exit(1);
  }
  user.passwordHash = await hashPassword(pw);
  user.mustChangePassword = !chosen;
  user.disabled = false;
  await user.save();
  audit(null, 'admin.reset-password', `${user.name} (${user.username})`, 'from the command line');
} else {
  if (user) {
    console.error(`The username "${username}" is already taken (role: ${user.role}).`);
    process.exit(1);
  }
  user = await User.create({ username: username.toLowerCase(), name: name.toUpperCase(), role: 'admin', passwordHash: await hashPassword(pw), mustChangePassword: !chosen });
  audit(null, 'admin.create', `${user.name} (${user.username})`, 'from the command line');
}

console.log(`Admin "${user.username}" ${reset ? 'password reset' : 'created'}.`);
if (chosen) console.log('Password set as given.');
else {
  saveCredentials('ADMIN', [{ username: user.username, name: user.name, tempPassword: pw }]);
  console.log(`Temporary password: ${pw}`);
  console.log('It must be changed at first sign-in. Also saved in server/credentials/.');
}
await new Promise((r) => setTimeout(r, 200)); // let the audit write finish
await mongoose.disconnect();
