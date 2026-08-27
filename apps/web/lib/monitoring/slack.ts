import type { ContactInput } from "@katbose/shared";

export async function notifyContact(input: Pick<ContactInput, "name" | "email" | "message">) {
  const url = process.env["SLACK_CONTACT_WEBHOOK_URL"];
  if (!url) return;
  const text = `New contact form submission\nName: ${input.name}\nEmail: ${input.email}\nMessage: ${input.message}`;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(3000),
  });
}
