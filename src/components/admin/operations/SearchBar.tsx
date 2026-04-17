export default function SearchBar() {
    return (
        <div className="w-full flex items-center gap-2">

            <input
                type="text"
                placeholder="Search leads or clients..."
                className="flex-1 px-4 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-800 text-sm focus:outline-none focus:border-blue-500"
            />

            <button
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
                Filter
            </button>

        </div>
    )
}
