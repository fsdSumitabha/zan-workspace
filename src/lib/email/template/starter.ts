/**
 * The MJML a new template starts from, and the blocks the editor offers.
 *
 * A blank canvas is the wrong default. Somebody opening the editor for the
 * first time should see a working email in the Zan colours, with a footer
 * that already carries the unsubscribe link, so the first thing they do is
 * edit rather than build the legally required parts from nothing.
 */

/** The emerald the rest of the CRM uses for its primary colour. */
const BRAND = "#059669"
const INK = "#0f172a"
const MUTED = "#64748b"
const LINE = "#e2e8f0"

export function starterMjml(options: {
    companyName?: string
    postalAddress?: string
} = {}): string {
    const company = options.companyName ?? "Zan Services"
    const address = options.postalAddress ?? "{{postal_address}}"

    return `<mjml>
  <mj-head>
    <mj-title>Untitled campaign</mj-title>
    <mj-preview>A short line that shows next to the subject in the inbox.</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="15px" line-height="1.6" color="${INK}" />
      <mj-button background-color="${BRAND}" color="#ffffff" border-radius="8px" font-size="15px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f1f5f9">
    <mj-section padding="24px 0 8px">
      <mj-column>
        <mj-text align="center" font-size="20px" font-weight="bold" color="${INK}">
          ${company}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#ffffff" border-radius="12px" padding="32px 24px">
      <mj-column>
        <mj-text font-size="22px" font-weight="bold" padding-bottom="8px">
          Hello {{first_name}},
        </mj-text>
        <mj-text>
          Write your message here. Use the panel on the left to drag in more
          sections, images and buttons.
        </mj-text>
        <mj-button href="https://zanservices.com" padding-top="20px">
          Read more
        </mj-button>
      </mj-column>
    </mj-section>

    <mj-section padding="24px 16px">
      <mj-column>
        <mj-divider border-color="${LINE}" border-width="1px" />
        <mj-text align="center" font-size="12px" color="${MUTED}" line-height="1.6">
          You are receiving this because you are in touch with ${company}.
          <br />
          ${address}
          <br /><br />
          <a href="{{unsubscribe_url}}" style="color:${MUTED};">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
}

/**
 * Extra blocks for the editor's left panel, on top of the ones
 * grapesjs-mjml ships.
 *
 * Each is a snippet of MJML that is dropped onto the canvas. They exist so
 * a designer does not have to rebuild the same footer or the same two-column
 * row on every template.
 */
export interface StarterBlock {
    id: string
    label: string
    /** Which group it appears under in the panel. */
    category: string
    content: string
}

export const STARTER_BLOCKS: readonly StarterBlock[] = [
    {
        id: "zan-heading",
        label: "Heading",
        category: "Zan blocks",
        content: `<mj-text font-size="22px" font-weight="bold" color="${INK}" padding-bottom="8px">Your heading</mj-text>`,
    },
    {
        id: "zan-paragraph",
        label: "Paragraph",
        category: "Zan blocks",
        content: `<mj-text>Write something here.</mj-text>`,
    },
    {
        id: "zan-button",
        label: "Brand button",
        category: "Zan blocks",
        content: `<mj-button background-color="${BRAND}" color="#ffffff" border-radius="8px" href="https://zanservices.com">Click here</mj-button>`,
    },
    {
        id: "zan-card",
        label: "White card section",
        category: "Zan blocks",
        content: `<mj-section background-color="#ffffff" border-radius="12px" padding="32px 24px">
  <mj-column>
    <mj-text font-size="18px" font-weight="bold" padding-bottom="8px">Card title</mj-text>
    <mj-text>Card body.</mj-text>
  </mj-column>
</mj-section>`,
    },
    {
        id: "zan-two-column",
        label: "Two columns",
        category: "Zan blocks",
        content: `<mj-section background-color="#ffffff" padding="16px">
  <mj-column><mj-text>Left</mj-text></mj-column>
  <mj-column><mj-text>Right</mj-text></mj-column>
</mj-section>`,
    },
    {
        id: "zan-footer",
        label: "Footer with unsubscribe",
        category: "Zan blocks",
        content: `<mj-section padding="24px 16px">
  <mj-column>
    <mj-divider border-color="${LINE}" border-width="1px" />
    <mj-text align="center" font-size="12px" color="${MUTED}" line-height="1.6">
      You are receiving this because you are in touch with Zan Services.
      <br />{{postal_address}}<br /><br />
      <a href="{{unsubscribe_url}}" style="color:${MUTED};">Unsubscribe</a>
    </mj-text>
  </mj-column>
</mj-section>`,
    },
    {
        id: "zan-spacer",
        label: "Spacer",
        category: "Zan blocks",
        content: `<mj-spacer height="24px" />`,
    },
]
