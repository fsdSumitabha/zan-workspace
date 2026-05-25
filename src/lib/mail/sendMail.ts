import { transporter } from "./transporter"

interface SendMailOptions {
    to: string
    subject: string
    html: string
}

export async function sendMail(options: SendMailOptions) {
    await transporter.sendMail({
        from: process.env.SMTP_USER,
        ...options
    })
}