"use client"

import UserForm from "@/components/admin/operations/UserForm"

export default function Page() {
    const handleCreateUser = async (data: any) => {
        try {
            const fd = new FormData()
            fd.append("name", data.name)
            fd.append("email", data.email)
            fd.append("password", data.password)
            fd.append("role", String(data.role))
            fd.append("isActive", String(data.isActive))

            if (data.avatarFile) {
                fd.append("avatarFile", data.avatarFile)
            }

            const res = await fetch("/api/admin/operations/users", {
                method: "POST",
                body: fd
            })

            const json = await res.json()

            if (!json.success) {
                throw new Error(json.message)
            }

            console.log("User created")
        } catch (err) {
            console.error(err)
        }
    }

    return <UserForm onSubmit={handleCreateUser} />
}