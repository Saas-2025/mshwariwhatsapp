import mongoose, { Document, Schema } from 'mongoose';

/**
 * Links a Facebook Page to a session so the same per-session AI agent can
 * reply to Messenger messages AND page feed comments.
 * Connected manually (Page Access Token + Webhook) — see the UI for setup steps.
 */
export interface IFacebookConnection extends Document {
    sessionId: string;
    userId?: string;
    pageId: string;
    pageName?: string;
    pageAccessToken?: string;
    verifyToken?: string;
    replyToMessages: boolean;
    replyToComments: boolean;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}

const FacebookConnectionSchema = new Schema<IFacebookConnection>({
    sessionId: { type: String, required: true, unique: true },
    userId: { type: String },
    pageId: { type: String, index: true },
    pageName: { type: String },
    pageAccessToken: { type: String },
    verifyToken: { type: String },
    replyToMessages: { type: Boolean, default: true },
    replyToComments: { type: Boolean, default: true },
    isActive: { type: Boolean, default: false }
}, { timestamps: true });

export const FacebookConnection = mongoose.model<IFacebookConnection>('FacebookConnection', FacebookConnectionSchema);
