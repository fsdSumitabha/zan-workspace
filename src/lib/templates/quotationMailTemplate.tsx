/**
 * The quotation email a client or a lead receives.
 *
 * Same frame as the other two templates in this folder: one 600px table,
 * inline styles, no external CSS. Mail clients strip stylesheets, so the
 * styles have to live on the elements.
 *
 * Money is the part that has to be right. The figures are laid out the same
 * way the timeline shows them, so a client and the person who sent it are
 * reading the same three numbers: the amount, the GST on it, and the total.
 */

interface QuotationMailParams {
    /** The client's or lead's name, for the greeting. */
    recipientName: string
    /** The quotation's own title. */
    title?: string
    /** What the salesperson typed when they logged it. Optional. */
    description?: string
    /** Excluding GST, in rupees. */
    amount: number
    /** 18 means 18%. */
    gstPercentage: number
    /** The uploaded file on ImageKit, when there is one. */
    fileUrl?: string
    /** True when the file is attached to this email as well as linked. */
    attached?: boolean
}

/** 1234567.5 becomes "12,34,567.50". Indian grouping, always two decimals. */
function rupees(value: number): string {
    return new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

export function quotationMailTemplate({
    recipientName,
    title,
    description,
    amount,
    gstPercentage,
    fileUrl,
    attached = false,
}: QuotationMailParams) {
    const gstAmount = (amount * gstPercentage) / 100
    const total = amount + gstAmount

    const heading = title?.trim() || "Your quotation"
    const subject = title?.trim()
        ? `Quotation: ${title.trim()} — Zan Services`
        : "Your quotation from Zan Services"

    // Said in the body only when the file is genuinely attached, so the
    // email never points at an attachment that is not there.
    const fileLine = attached
        ? "The full quotation is attached to this email as a document."
        : fileUrl
          ? "The full quotation is available at the link below."
          : ""

    const html = `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(subject)}</title>
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
                                <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">${escapeHtml(heading)}</h2>
                                <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                                    Dear ${escapeHtml(recipientName)},
                                </p>
                                <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                                    Thank you for your interest in working with us. Please find our quotation below.${fileLine ? ` ${escapeHtml(fileLine)}` : ""}
                                </p>
${
    description?.trim()
        ? `                                <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(
              description.trim()
          )}</p>
`
        : ""
}                                <!-- Figures -->
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 28px;">
                                    <tr>
                                        <td style="padding:16px 20px 8px;color:#475569;font-size:14px;">Amount</td>
                                        <td style="padding:16px 20px 8px;color:#0f172a;font-size:14px;text-align:right;">&#8377;${rupees(
                                            amount
                                        )}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:0 20px 16px;color:#475569;font-size:14px;">GST at ${gstPercentage}%</td>
                                        <td style="padding:0 20px 16px;color:#0f172a;font-size:14px;text-align:right;">&#8377;${rupees(
                                            gstAmount
                                        )}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:14px 20px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:15px;font-weight:700;">Total payable</td>
                                        <td style="padding:14px 20px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:15px;font-weight:700;text-align:right;">&#8377;${rupees(
                                            total
                                        )}</td>
                                    </tr>
                                </table>
${
    fileUrl
        ? `                                <!-- CTA -->
                                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                                    <tr>
                                        <td style="border-radius:8px;background-color:#3b82f6;">
                                            <a href="${escapeAttribute(fileUrl)}" target="_blank"
                                                style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                                            View the full quotation
                                            </a>
                                        </td>
                                    </tr>
                                </table>
`
        : ""
}                                <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
                                    If anything here needs changing, or you would like to talk it through,
                                    reply to this email and we will come back to you.
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
                                    Email: <a href="mailto:sales@zanservices.com" style="color:#3b82f6;text-decoration:none;">sales@zanservices.com</a>
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

    const text = `${heading}

Dear ${recipientName},

Thank you for your interest in working with us. Please find our quotation below.${
        fileLine ? ` ${fileLine}` : ""
    }
${description?.trim() ? `\n${description.trim()}\n` : ""}
Amount:        Rs ${rupees(amount)}
GST at ${gstPercentage}%:   Rs ${rupees(gstAmount)}
Total payable: Rs ${rupees(total)}
${fileUrl ? `\nThe full quotation: ${fileUrl}\n` : ""}
If anything here needs changing, or you would like to talk it through, reply to this email and we will come back to you.

Zan Services
Website: zanservices.com
Phone: +91 82829 48444
Email: sales@zanservices.com

© ${new Date().getFullYear()} Zan Services`

    return { subject, html, text }
}

/**
 * Escapes text that goes between tags.
 *
 * A client's name, a quotation title and a salesperson's description are
 * all typed by a person. An ampersand or an angle bracket in any of them
 * would otherwise break the markup, and a pasted tag would end up in the
 * email as markup rather than as the characters somebody typed.
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

/**
 * Escapes a URL going into an href.
 *
 * The file URL comes from ImageKit rather than from a person, so this is a
 * belt-and-braces measure. A quote inside an attribute would otherwise end
 * the attribute early.
 */
function escapeAttribute(value: string): string {
    return escapeHtml(value).replace(/'/g, "&#39;")
}
