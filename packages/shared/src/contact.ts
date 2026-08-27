import { z } from "zod";

export const ContactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.email("Enter a valid email address.").max(200),
  message: z.string().trim().min(10, "Use at least 10 characters.").max(5000),
  website: z.literal("").optional(),
  turnstileToken: z.string().min(1, "Complete the bot check."),
});

export const ContactFormSchema = ContactSchema.omit({ turnstileToken: true });

export type ContactInput = z.infer<typeof ContactSchema>;
export type ContactFormInput = z.infer<typeof ContactFormSchema>;
