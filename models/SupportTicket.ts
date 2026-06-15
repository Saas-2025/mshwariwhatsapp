import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportMessage {
    from: 'user' | 'admin';
    text: string;
    fileName?: string;
    fileType?: string;
    fileData?: string; // base64 (no data: prefix)
    at: number;        // unix seconds
}

export interface ISupportTicket extends Document {
    userId: string;
    userName: string;   // snapshot for display if the user is later removed
    username: string;
    subject: string;
    status: 'open' | 'answered' | 'closed';
    messages: ISupportMessage[];
    lastUpdate: number;
    createdAt?: string;
    updatedAt?: string;
}

const MessageSchema = new Schema<ISupportMessage>({
    from: { type: String, enum: ['user', 'admin'], required: true },
    text: { type: String, default: '' },
    fileName: { type: String },
    fileType: { type: String },
    fileData: { type: String },
    at: { type: Number, required: true }
}, { _id: false });

const SupportTicketSchema = new Schema<ISupportTicket>({
    userId: { type: String, required: true, index: true },
    userName: { type: String, default: '' },
    username: { type: String, default: '' },
    subject: { type: String, required: true },
    status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
    messages: { type: [MessageSchema], default: [] },
    lastUpdate: { type: Number, default: 0 }
}, { timestamps: true });

export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
