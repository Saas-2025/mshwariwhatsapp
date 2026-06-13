
import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
    if (!process.env.MONGO_URI) {
        console.error('❌ MONGO_URI is not defined. Set it in your environment (Render dashboard / .env.local).');
    }

    let attempt = 0;
    // Retry with backoff instead of process.exit(). Exiting here caused a crash-loop
    // on Render (every request returned 503). Staying alive keeps health-check & CORS working.
    while (true) {
        attempt++;
        try {
            if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing');
            await mongoose.connect(process.env.MONGO_URI);
            console.log('✅ MongoDB Connected successfully');
            return;
        } catch (error: any) {
            const wait = Math.min(attempt * 3000, 30000);
            console.error(`❌ MongoDB connection failed (attempt ${attempt}): ${error?.message}. Retrying in ${wait / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, wait));
        }
    }
};
