import mongoose, { Document, Schema } from 'mongoose';

/**
 * Per-conversation overrides (one customer chat within a session).
 * - aiDisabled: stop the AI from replying to this specific customer.
 * - customPrompt: extra instructions so this customer is handled differently.
 */
export interface IChatSettings extends Document {
    sessionId: string;
    remoteJid: string;
    aiDisabled: boolean;
    customPrompt: string;
    categoryId?: string;   // customer segment/category for this chat
    createdAt?: string;
    updatedAt?: string;
}

const ChatSettingsSchema = new Schema<IChatSettings>({
    sessionId: { type: String, required: true },
    remoteJid: { type: String, required: true },
    aiDisabled: { type: Boolean, default: false },
    customPrompt: { type: String, default: '' },
    categoryId: { type: String, default: '' }
}, { timestamps: true });

ChatSettingsSchema.index({ sessionId: 1, remoteJid: 1 }, { unique: true });

export const ChatSettings = mongoose.model<IChatSettings>('ChatSettings', ChatSettingsSchema);
