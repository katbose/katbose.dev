"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ContactFormSchema, ContactSchema, type ContactFormInput } from "@katbose/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";

type Status = "idle" | "success" | "error";

const DEFAULT_VALUES: ContactFormInput = {
  name: "",
  email: "",
  message: "",
  website: "",
};

export function ContactForm({ fallbackEmail }: Readonly<{ fallbackEmail: string }>) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const {
    clearErrors,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormInput>({
    resolver: zodResolver(ContactFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const submit = handleSubmit(async (input, event) => {
    setStatus("idle");
    setMessage("");
    const form = event?.target;
    if (!(form instanceof HTMLFormElement)) return;
    const turnstileToken = new FormData(form).get("cf-turnstile-response");
    const payload = ContactSchema.safeParse({
      ...input,
      turnstileToken: typeof turnstileToken === "string" ? turnstileToken : "",
    });
    if (!payload.success) {
      setError("root.turnstile", { message: "Complete the bot check." });
      return;
    }
    clearErrors("root.turnstile");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) throw new Error("contact-failed");
      reset(DEFAULT_VALUES);
      setStatus("success");
      setMessage("Thank you — your message was received.");
    } catch {
      setStatus("error");
      setMessage(`Something went wrong — please email ${fallbackEmail} directly.`);
    }
  });

  return (
    <form className="contact-form" noValidate onSubmit={submit}>
      <label>
        Name
        <input
          aria-describedby={errors.name ? "contact-name-error" : undefined}
          aria-invalid={Boolean(errors.name)}
          autoComplete="name"
          maxLength={100}
          {...register("name")}
        />
      </label>
      {errors.name && (
        <p className="field-error" id="contact-name-error" role="alert">
          {errors.name.message}
        </p>
      )}
      <label>
        Email
        <input
          aria-describedby={errors.email ? "contact-email-error" : undefined}
          aria-invalid={Boolean(errors.email)}
          autoComplete="email"
          maxLength={200}
          type="email"
          {...register("email")}
        />
      </label>
      {errors.email && (
        <p className="field-error" id="contact-email-error" role="alert">
          {errors.email.message}
        </p>
      )}
      <label>
        Message
        <textarea
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          aria-invalid={Boolean(errors.message)}
          maxLength={5000}
          rows={7}
          {...register("message")}
        />
      </label>
      {errors.message && (
        <p className="field-error" id="contact-message-error" role="alert">
          {errors.message.message}
        </p>
      )}
      <label className="honeypot" tabIndex={-1}>
        Website
        <input autoComplete="off" tabIndex={-1} {...register("website")} />
      </label>
      {errors.root?.["turnstile"] && (
        <p className="field-error" role="alert">
          {errors.root["turnstile"].message}
        </p>
      )}
      <p className="form-notice">
        Bot protection must be available before submission. By submitting, you agree this message
        may be stored so I can reply.
      </p>
      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? "Sending…" : "Send message"}
      </button>
      <p aria-live="polite" className="form-status" data-status={status}>
        {message}
      </p>
    </form>
  );
}
