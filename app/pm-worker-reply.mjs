/**
 * Restores line breaks damaged by the legacy PM Worker ASP JSON parser.
 *
 * That parser removes JSON escape backslashes, turning a paragraph break
 * (`\n\n`) into the literal text `nn`. Keep ordinary English words such as
 * "running" intact by only repairing `nn` outside ASCII words.
 */
export function normalizePmWorkerReply(reply) {
  return String(reply ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\r\\n|\\n/g, "\n")
    .replace(/(?<![A-Za-z])nn(?![A-Za-z])/g, "\n\n")
    .replace(/(?<![A-Za-z])n(?=\d{1,2}(?:[.)])?\s)/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
