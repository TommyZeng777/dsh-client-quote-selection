/**
 * @thomas/dsh-client-quote-selection — node half.
 *
 * Deliberately empty: this plugin is browser-only UI. It registers into the
 * session-scoped `conversation.input.attachments` slot on the Client half and
 * never touches the host process.
 */

/** Host plugin body — nothing to do on the host. */
export function apply() {}
