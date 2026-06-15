import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    name: string;
    username: string; // Used as email/login id
    password?: string;
    role: 'admin' | 'user';
    permissions?: string[];
    maxSessions?: number; // 0 = unlimited (admins are always unlimited)
    planId?: string;      // subscribed plan
    apiKey?: string;      // account-level key for the external REST API
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

const UserSchema = new Schema<IUser>({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    permissions: { type: [String], default: [] },
    maxSessions: { type: Number, default: 0 }, // 0 = unlimited
    planId: { type: String, default: '' },
    apiKey: { type: String, default: '', index: true },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

export const User = mongoose.model<IUser>('User', UserSchema);
