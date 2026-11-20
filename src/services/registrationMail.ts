import { sendMail } from "@/lib/mail/sendMail"
import { MAIL_ACCOUNT } from "@/lib/mail/accounts"
import { welcomeMailTemplate } from "@/lib/templates/welcomeMailTemplate"
import { registrationMailTemplate } from "@/lib/templates/registrationMailTemplate"

/**
 * The mail sent when somebody creates a user.
 *
 * Both messages go from the HR mailbox. This is the user module: one
 * message tells the internal inbox that an account was created, the other
 * gives the new person their password. Neither is a customer, so neither
 * belongs in the sales mailbox.
 */

interface RegistrationMailData {
    name: string
    email: string
    password: string
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
        password: data.password,
        roleLabel: data.roleLabel,
        loginUrl,
    })

    const registration = registrationMailTemplate(data)

    await sendMail({
        account: MAIL_ACCOUNT.HR,
        to: process.env.MAIL_TO!,
        subject: registration.subject,
        html: registration.html,
    })

    await sendMail({
        account: MAIL_ACCOUNT.HR,
        to: data.email,
        subject: welcome.subject,
        html: welcome.html,
    })
}