import User from "@/models/User" 

export async function resolveAttendeeEmails(
    attendeeIds: string[]
): Promise<string[]> {
    if (!attendeeIds.length) return []

    const users = await User.find({ _id: { $in: attendeeIds } })
        .select("email")
        .lean()

    return users
        .map((u: { email?: string }) => u.email)
        .filter((email): email is string => Boolean(email))
}