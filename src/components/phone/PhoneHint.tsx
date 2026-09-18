// Text under a phone field: the error, or a note when the saved value is
// not a valid number. That old value is kept unless the user enters a new one.

interface PhoneHintProps {
    error?: string
    savedInvalid?: string
}

export default function PhoneHint({ error, savedInvalid }: PhoneHintProps) {
    if (error) {
        return <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
    }
    if (savedInvalid) {
        return (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {/* break-all only on the value: a long saved value must wrap,
                    but the words of the note must not break. */}
                Saved value &quot;<span className="break-all">{savedInvalid}</span>&quot; is not a
                valid number. It stays as it is unless you enter a new one.
            </p>
        )
    }
    return null
}
