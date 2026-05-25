interface WelcomeMailParams {
    name: string
    email: string
    password: string
    roleLabel: string
    loginUrl?: string
}

export function welcomeMailTemplate({
    name,
    email,
    password,
    roleLabel,
    loginUrl = "https://zanservices.com",
}: WelcomeMailParams) {
    const subject = "Welcome to Zan Services 🎉"

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
                            <td style="background-color:#0f172a;padding:32px 40px;">
                                <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.3px;">
                                    Zan <span style="color:#3b82f6;">Services</span>
                                </h1>
                                <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Transform Your Digital Future</p>
                            </td>
                        </tr>
                        <!-- Body -->
                        <tr>
                            <td style="padding:40px;">
                                <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Welcome aboard, ${name} 👋</h2>
                                <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                                    An account has been created for you on the <strong>Zan Services</strong> platform.
                                    We're excited to have you on the team. Below are your account details.
                                </p>
                                <!-- Details box -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:8px 0 24px;">
                                    <tr>
                                        <td style="padding:16px 20px;color:#475569;font-size:14px;line-height:1.8;">
                                            <strong style="color:#0f172a;">Email:</strong> ${email}<br/>
                                            <strong style="color:#0f172a;">Role:</strong> ${roleLabel}<br/>
                                            <strong style="color:#0f172a;">Password:</strong> ${password}
                                        </td>
                                    </tr>
                                </table>
                                <!-- CTA -->
                                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                                    <tr>
                                        <td style="border-radius:8px;background-color:#3b82f6;">
                                            <a href="${loginUrl}" target="_blank"
                                                style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                                            Log in to your account
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">About Zan Services</p>
                                <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
                                    We're a Web Development and Digital Marketing Agency focused on helping businesses
                                    build a strong digital presence through modern technology, performance-driven websites,
                                    and growth-oriented marketing.
                                </p>
                                <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
                                    Our expertise spans modern website development, SEO, digital branding,
                                    lead generation, and website performance optimization.
                                </p>
                            </td>
                        </tr>
                        <!-- Footer -->
                        <tr>
                            <td style="background-color:#0f172a;padding:28px 40px;">
                                <p style="margin:0 0 8px;color:#ffffff;font-size:15px;font-weight:700;">Zan Services</p>
                                <p style="margin:0 0 4px;color:#94a3b8;font-size:13px;line-height:1.7;">
                                    Website: <a href="https://zanservices.com" style="color:#3b82f6;text-decoration:none;">zanservices.com</a><br/>
                                    Phone: +91 82829 48444<br/>
                                    Email: <a href="mailto:support@zanservices.com" style="color:#3b82f6;text-decoration:none;">support@zanservices.com</a>
                                </p>
                                <p style="margin:12px 0 0;font-size:13px;">
                                    <a href="https://in.linkedin.com/company/zan-services" style="color:#3b82f6;text-decoration:none;margin-right:14px;">LinkedIn</a>
                                    <a href="https://www.instagram.com/zanservices" style="color:#3b82f6;text-decoration:none;margin-right:14px;">Instagram</a>
                                    <a href="https://www.facebook.com/share/1AiNv7N6Ky/" style="color:#3b82f6;text-decoration:none;">Facebook</a>
                                </p>
                            </td>
                        </tr>
                    </table>
                    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} Zan Services. All rights reserved.</p>
                </td>
            </tr>
        </table>
    </body>
</html>`

    const text = `Welcome to Zan Services, ${name}!

An account has been created for you on the Zan Services platform.

Email: ${email}
Role: ${roleLabel}

Log in: ${loginUrl}

About us:
Zan Services is a Web Development and Digital Marketing Agency focused on helping businesses build a strong digital presence through modern technology, performance-driven websites, and growth-oriented marketing.

Contact:
Website: zanservices.com
Phone: +91 82829 48444
Email: support@zanservices.com

© ${new Date().getFullYear()} Zan Services`

    return { subject, html, text }
}