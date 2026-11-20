import { Types } from "mongoose";

export interface Quotation {
    _id?: Types.ObjectId; // optional when creating new quotations
    entityType: 0 | 1 | 2; // 0: LEAD, 1: CLIENT, 2: PROJECT
    entityId: Types.ObjectId;
    title?: string;
    amount: number; // amount including GST
    url?: string;
    status?: number;
    uploadedBy?: Types.ObjectId; // references User
    createdAt?: Date;
    updatedAt?: Date;
    // Whether it reached the client by email. Absent on every quotation
    // created before the app could email one. See
    // src/services/quotationMail.ts.
    mail?: {
        status?: "sent" | "failed";
        to?: string;
        sentAt?: Date;
        attempts?: number;
        error?: string;
    };
}