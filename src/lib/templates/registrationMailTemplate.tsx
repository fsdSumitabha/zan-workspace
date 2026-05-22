interface RegistrationMailParams {
    name: string
    email: string
    roleLabel: string
    createdByName?: string
    createdByEmail?: string
}

export function registrationMailTemplate({
    name,
    email,
    roleLabel,
    createdByName = "—",
    createdByEmail = "—",
}: RegistrationMailParams) {
    const subject = `New user account created: ${name}`

    const createdAt = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
    })

    const html = `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
            <tr>
                <td align="center">
                    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color:#0f172a;padding:28px 40px;">
                                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
                                    Zan <span style="color:#3b82f6;">Services</span>
                                </h1>
                                <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Admin Notification</p>
                            </td>
                        </tr>
                        <!-- Body -->
                        <tr>
                            <td style="padding:36px 40px;">
                                <h2 style="margin:0 0 8px;color:#0f172a;font-size:19px;">New user account created</h2>
                                <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
                                    A new account has just been created in the Zan Services system. Details below.
                                </p>
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                                    <tr>
                                        <td style="padding:12px 20px;background-color:#f8fafc;color:#0f172a;font-size:13px;font-weight:600;width:160px;border-bottom:1px solid #e2e8f0;">Name</td>
                                        <td style="padding:12px 20px;color:#475569;font-size:14px;border-bottom:1px solid #e2e8f0;">${name}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 20px;background-color:#f8fafc;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;">Email</td>
                                        <td style="padding:12px 20px;color:#475569;font-size:14px;border-bottom:1px solid #e2e8f0;">${email}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 20px;background-color:#f8fafc;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;">Role</td>
                                        <td style="padding:12px 20px;color:#475569;font-size:14px;border-bottom:1px solid #e2e8f0;">${roleLabel}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 20px;background-color:#f8fafc;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;">Created by</td>
                                        <td style="padding:12px 20px;color:#475569;font-size:14px;border-bottom:1px solid #e2e8f0;">${createdByName} (${createdByEmail})</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 20px;background-color:#f8fafc;color:#0f172a;font-size:13px;font-weight:600;">Created at</td>
                                        <td style="padding:12px 20px;color:#475569;font-size:14px;">${createdAt} IST</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color:#0f172a;padding:20px 40px;">
                                <p style="margin:0;color:#94a3b8;font-size:12px;">
                                    Automated message from the Zan Services platform · support@zanservices.com
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>`

    const text = `New user account created

Name: ${name}
Email: ${email}
Role: ${roleLabel}
Created by: ${createdByName} (${createdByEmail})
Created at: ${createdAt} IST

Automated message from the Zan Services platform.`

    return { subject, html, text }
}