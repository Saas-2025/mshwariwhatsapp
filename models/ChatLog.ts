import mongoose, { Document, Schema } from 'mongoose';

/**
 * Persistent conversation log per session + chat.
 * Powers: AI conversation memory, the per-session conversation history page,
 * and response analytics. (Separate from Message, which is TTL-pruned after 24h.)
 */
export interface IChatLog extends Document {
    sessionId: string;
    userId?: string;
    remoteJid: string;
    role: 'user' | 'assistant';
    text: string;
    pushName?: string;
    source?: 'ai' | 'keyword' | 'manual';
    timestamp: number;
    createdAt?: string;
}

const ChatLogSchema = new Schema<IChatLog>({
    sessionId: { type: String, required: true },
    userId: { type: String },
    remoteJid: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, default: '' },
    pushName: { type: String },
    source: { type: String, enum: ['ai', 'keyword', 'manual'], default: 'ai' },
    timestamp: { type: Number, required: true }
}, { timestamps: true });

ChatLogSchema.index({ sessionId: 1, remoteJid: 1, timestamp: 1 });
ChatLogSchema.index({ sessionId: 1, timestamp: -1 });
// Keep ~30 days of history (bounded growth on the free tier).
ChatLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const ChatLog = mongoose.model<IChatLog>('ChatLog', ChatLogSchema);
