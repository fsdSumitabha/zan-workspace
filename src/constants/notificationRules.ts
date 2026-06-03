import { EventType } from "./eventTypes"
import { UserRole } from "./userRoles"

export const NOTIFICATION_RULES: Partial<Record<EventType, UserRole[]>> = {
    1000: [ 10, 30, 45, 60 ],   // Lead created
    1010: [ 10, 30, 45, 60 ],   // Lead converted
    1020: [ 10, 30, 45, 60 ],   //Lead Status changed

    1100: [ 10, 30, 45, 60 ],   // Client created
    1110: [ 10, 30, 45, 60 ],   // Client Status changed

    1200: [ 10, 30, 45, 60 ],   // Project created
    1210: [ 10, 30, 45, 60 ],   // Project Status changed

    2010: [ 10, 30, 45, 60 ],   // Meeting Scheduled
    2020: [ 10, 30, 45, 60 ],   // Meeting Completed
    2030: [ 10, 30, 45, 60 ],   // Meeting Cancelled
    2040: [ 10, 30, 45, 60 ],  // Meeting Rescheduled

    2110: [ 10, 30, 45, 60 ],   // Note Added
    
    2210: [ 10, 45, 60 ],   // Call Made
    
    2310: [ 10, 30, 45, 60 ],   // Document Uploaded
    
    2410: [ 10, 30, 45, 60, 70 ],  // Quotation Sent - also notify accountants

    2510: [ 10, 30, 45, 60 ],   // Status Changed - generic catch-all for important status changes
} as const