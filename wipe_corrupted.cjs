const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config(); // Load variables from .env

async function wipeNumber() {
    try {
        console.log("Connecting to MongoDB...");
        // Read connection string from environment — never hardcode credentials
        const uri = process.env.MONGO_URI;
        if (!uri) {
            console.error("❌ MONGO_URI is not set. Add it to your .env / .env.local file.");
            process.exit(1);
        }

        console.log("URI Loaded:", uri.substring(0, 20) + "...");

        await mongoose.connect(uri);
        console.log("Connected.");

        const AuthState = mongoose.models.AuthState || mongoose.model('AuthState', new mongoose.Schema({ sessionId: String }, { strict: false }));

        const targetSessionId = 'sess_1772886488441';

        console.log(`Targeting Session: ${targetSessionId}`);
        const authDel = await AuthState.deleteMany({ sessionId: targetSessionId });
        console.log(`Deleted ${authDel.deletedCount} auth states (keys) for ${targetSessionId}`);

        process.exit(0);
    } catch (err) {
        console.error("Connection Error:", err);
        process.exit(1);
    }
}

wipeNumber();
