type Invert<T extends Record<string, PropertyKey>> = {
    [K in keyof T as T[K]]: K;
};

export function invert<T extends Record<string, PropertyKey>>(obj: T): Invert<T> {
    return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [v, k])
    ) as Invert<T>;
}