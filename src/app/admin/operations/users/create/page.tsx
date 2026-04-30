"use client"

import UserForm from "@/components/admin/operations/UserForm"

export default function Page() {
    const handleCreateUser = async (data: any) => {
        try {
            const res = await fetch("/api/admin/operations/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            })

            const json = await res.json()

            if (!json.success) {
                throw new Error(json.message)
            }

            // success handling (toast / redirect)
            console.log("User created")
        } catch (err) {
            console.error(err)
        }
    }

    return <UserForm onSubmit={handleCreateUser} />
}