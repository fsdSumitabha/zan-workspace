import { EntityType } from "./entityTypes"
import { LEAD_STATUS_META } from "./leadStatus"
import { CLIENT_STATUS_META } from "./clientStatus"
import { PROJECT_STATUS_META } from "./projectStatus"

export const STATUS_META_BY_ENTITY: Record<
    EntityType,
    Record<number, { label: string; color: string; decoration?: string }>
> = {
    0: LEAD_STATUS_META,
    1: CLIENT_STATUS_META,
    2: PROJECT_STATUS_META,
}