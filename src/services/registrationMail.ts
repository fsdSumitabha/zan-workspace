import { sendMail } from "@/lib/mail/sendMail"
import { welcomeMailTemplate } from "@/lib/templates/welcomeMailTemplate"
import { registrationMailTemplate } from "@/lib/templates/registrationMailTemplate"

interface RegistrationMailData {
    name: string
    email: string
    roleLabel: string
    baseUrl: string
    createdByName?: string
    createdByEmail?: string
}

export async function sendRegistrationMail(data: RegistrationMailData) {
    const loginUrl = `${data.baseUrl}/admin/operations`

    const welcome = welcomeMailTemplate({
        name: data.name,
        email: data.email,
        roleLabel: data.roleLabel,
        loginUrl,
    })

    const registration = registrationMailTemplate(data)

    await sendMail({
        to: process.env.MAIL_TO!,
        subject: registration.subject,
        html: registration.html,
    })

    await sendMail({
        to: data.email,
        subject: welcome.subject,
        html: welcome.html,
    })
}