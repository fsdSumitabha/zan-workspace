import { Service } from "@/config/services"
import { Status } from "@/config/statuses"
import { Interaction } from "./interaction"

export interface Contact {
    name: string
    company: string
    service: Service
    status: Status
    interaction: Interaction
}