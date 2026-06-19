export const contactEmail = "support@goodcoiner.com";
export const contactSubject = "グッドコイナーへの問い合わせ";

export function getContactMailtoUrl() {
  return `mailto:${contactEmail}?subject=${encodeURIComponent(contactSubject)}`;
}
