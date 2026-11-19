"use client"

import { useEffect, useRef } from "react"
import grapesjs, { type Editor } from "grapesjs"
import mjmlPlugin from "grapesjs-mjml"
import "grapesjs/dist/css/grapes.min.css"
import "./editor.css"

import type { EmailEditorPayload } from "@/types/email"

/**
 * The GrapesJS canvas, wrapped so the rest of the app never touches
 * GrapesJS directly.
 *
 * ## It must not render on the server
 *
 * GrapesJS reaches for `window` at import time. The parent loads this file
 * through `next/dynamic` with `ssr: false`, which is the only reason an
 * import of it at the top of this file is safe.
 *
 * ## Mounting under React 19
 *
 * GrapesJS is not a React component. It takes a DOM node and owns
 * everything inside it. Two rules follow, and breaking either produces a
 * second ghost canvas that is very hard to debug:
 *
 *   1. The effect must run once. React 19 in development mounts, unmounts
 *      and remounts every effect, so `initialised` guards against building
 *      two editors over the same node.
 *   2. The effect must destroy the editor in its cleanup, or the remount
 *      finds the old one still attached.
 *
 * The dependency array is deliberately empty. Re-running on a prop change
 * would rebuild the canvas and throw away the designer's undo history.
 * Later changes reach the editor through the `onReady` handle instead.
 */

export interface MjmlEditorHandle {
    /** The current MJML source. */
    getMjml: () => string
    /** Replaces the canvas content. Used by Import and by version revert. */
    setMjml: (mjml: string) => void
    undo: () => void
    redo: () => void
    /** "desktop" or "mobile". Switches the canvas width. */
    setDevice: (device: "desktop" | "mobile") => void
    /** Inserts a snippet at the current selection. */
    insert: (content: string) => void
}

export default function MjmlEditor({
    payload,
    onReady,
    onChange,
}: {
    payload: EmailEditorPayload
    onReady: (handle: MjmlEditorHandle) => void
    onChange: () => void
}) {
    const hostRef = useRef<HTMLDivElement>(null)
    const initialised = useRef(false)
    const editorRef = useRef<Editor | null>(null)

    // Props are read through refs so the effect can stay dependency-free
    // without going stale.
    const onReadyRef = useRef(onReady)
    const onChangeRef = useRef(onChange)
    onReadyRef.current = onReady
    onChangeRef.current = onChange

    useEffect(() => {
        if (initialised.current || !hostRef.current) return
        initialised.current = true

        const editor = grapesjs.init({
            container: hostRef.current,
            height: "100%",
            width: "auto",
            fromElement: false,

            // Our own save lives in the toolbar. GrapesJS's built-in storage
            // would write to localStorage and quietly compete with it.
            storageManager: false,

            // The panels GrapesJS adds by default assume its own demo
            // layout. We supply the toolbar, so they are turned off and the
            // managers are mounted into our own containers below.
            panels: { defaults: [] },

            blockManager: { appendTo: "#gjs-blocks" },
            layerManager: { appendTo: "#gjs-layers" },
            selectorManager: { appendTo: "#gjs-selectors" },
            styleManager: { appendTo: "#gjs-styles" },
            traitManager: { appendTo: "#gjs-traits" },

            assetManager: {
                // The library the Assets panel already loaded. Uploading is
                // handled by our own panel, which posts to ImageKit and then
                // adds the result here.
                assets: payload.assets.map((a) => ({
                    type: "image",
                    src: a.url,
                    name: a.name,
                    height: a.height ?? undefined,
                    width: a.width ?? undefined,
                })),
                upload: false,
                autoAdd: true,
            },

            plugins: [mjmlPlugin],
            pluginsOpts: {
                [mjmlPlugin as unknown as string]: {
                    // Keep GrapesJS's own blocks out; ours are added below
                    // alongside the plugin's MJML blocks.
                    resetBlocks: true,
                    resetStyleManager: true,
                    resetDevices: true,
                    hideSelector: false,
                    // Void elements such as <mj-image /> are normal in
                    // imported MJML, and the HTML parser mangles them.
                    useXmlParser: true,
                    imagePlaceholderSrc:
                        "data:image/svg+xml;base64," +
                        btoa(
                            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">' +
                            '<rect width="600" height="200" fill="#e2e8f0"/>' +
                            '<text x="300" y="105" font-family="sans-serif" font-size="16" ' +
                            'fill="#64748b" text-anchor="middle">Pick an image</text></svg>'
                        ),
                },
            },
        })

        editorRef.current = editor

        // Our own blocks, on top of the plugin's.
        for (const block of payload.starterBlocks) {
            editor.BlockManager.add(block.id, {
                label: block.label,
                category: block.category,
                content: block.content,
                attributes: { class: "gjs-block-zan" },
            })
        }

        // Load the content. setComponents goes through the MJML parser the
        // plugin installed, so this accepts MJML rather than HTML.
        editor.setComponents(payload.mjml)

        // Everything that counts as an edit. `update` alone misses style
        // changes on some GrapesJS versions, so the specific ones are
        // listed too.
        const markChanged = () => onChangeRef.current()
        editor.on("update", markChanged)
        editor.on("component:update", markChanged)
        editor.on("styleable:change", markChanged)

        const handle: MjmlEditorHandle = {
            getMjml: () => String(editor.runCommand("mjml-code") ?? ""),
            setMjml: (mjml: string) => {
                editor.setComponents(mjml)
            },
            undo: () => editor.UndoManager.undo(),
            redo: () => editor.UndoManager.redo(),
            setDevice: (device) =>
                editor.setDevice(device === "mobile" ? "Mobile portrait" : "Desktop"),
            insert: (content: string) => {
                const selected = editor.getSelected()
                if (selected) selected.append(content)
                else editor.addComponents(content)
            },
        }

        onReadyRef.current(handle)

        return () => {
            editor.off("update", markChanged)
            editor.off("component:update", markChanged)
            editor.off("styleable:change", markChanged)
            editor.destroy()
            editorRef.current = null
            initialised.current = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return <div ref={hostRef} className="h-full w-full" />
}
