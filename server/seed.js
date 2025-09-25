// seed.js
const mongoose = require('mongoose');
const User = require('./User');

mongoose.connect('mongodb://127.0.0.1:27017/chatapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB Connected"))
.catch(err => console.error(err));

async function seedUsers() {
  try {
    await User.deleteMany({}); // Clear old data (optional)

    const users = [
      {
        username: "john_doe",
        password: "123456",   // will be hashed automatically
        lastSeen: new Date("2025-09-20T10:30:00.000Z"),
        isOnline: true
      },
      {
        username: "jane_smith",
        password: "password123",
        lastSeen: new Date("2025-09-19T18:45:00.000Z"),
        isOnline: false
      },
      {
        username: "mike_92",
        password: "mikepassword",
        lastSeen: new Date("2025-09-18T22:10:00.000Z"),
        isOnline: false
      },
      {
        username: "sara_k",
        password: "sarapass",
        lastSeen: new Date("2025-09-20T14:15:00.000Z"),
        isOnline: true
      }
    ];

    await User.insertMany(users);
    console.log("Dummy users inserted!");
    mongoose.connection.close();
  } catch (error) {
    console.error(error);
  }
}

seedUsers();
