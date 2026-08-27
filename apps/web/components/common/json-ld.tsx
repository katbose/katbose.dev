interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: Readonly<JsonLdProps>) {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replaceAll("<", "\\u003c") }}
      type="application/ld+json"
    />
  );
}
